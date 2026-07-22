"""Stage 2 filter: Refined screening with abstract."""

from loguru import logger

from src.cache import CacheManager
from src.llm import AsyncLLMClient, Stage2Result, prepare_result_with_conversation
from src.fetcher import ArxivHTMLCrawler
from src.parser import ArxivHtmlCleaner

class Stage2Filter:
    """
    Stage 2 filter: Refined screening with abstract.

    Filters papers based on title, authors, categories, and abstract.
    Uses a medium threshold for more selective filtering.
    """

    def __init__(
    	self,
    	llm_client: AsyncLLMClient,
    	cache_manager: CacheManager,
    	html_crawler: ArxivHTMLCrawler,
    	threshold: float = 0.7,
    	temperature: float = 0.1,
    	max_text_chars: int = 40000,
    	custom_fields: list[dict[str, str]] | None = None,
    	config_hash: str | None = None,
	):
        """
        Initialize Stage 2 filter.

        Args:
            llm_client: Async LLM client for evaluation
            cache_manager: Cache manager for storing results
            threshold: Score threshold for passing (0-1)
            temperature: LLM temperature for sampling (0-1)
            config_hash: Configuration hash for cache invalidation
        """
        self.llm_client = llm_client
        self.cache_manager = cache_manager
        self.threshold = threshold
        self.temperature = temperature
        self.config_hash = config_hash
        self.html_crawler = html_crawler
        self.max_text_chars = max_text_chars
        self.custom_fields = custom_fields or []

        logger.info(f"Stage2Filter initialized: threshold={threshold}, temperature={temperature}")

    async def filter_batch(
        self,
        papers: list[dict],
        user_prompt: str,
    ) -> list[tuple[dict, dict]]:
        """
        Filter multiple papers in parallel.

        Args:
            papers: List of paper dicts with keys: id, title, authors, categories, abstract
            user_prompt: User's filtering criteria

        Returns:
            List of (paper, result_dict) tuples where result_dict contains score, reasoning, pass_filter
        """
        logger.info(f"Stage 2 filtering {len(papers)} papers...")

        # Separate cached and uncached papers
        cached_results = []
        uncached_papers = []

        for paper in papers:
            paper_id = paper["id"]
            cached = self.cache_manager.get(2, paper_id, self.config_hash)

            if cached is not None:
                cached_results.append((paper, cached))
            else:
                uncached_papers.append(paper)

        logger.info(
            f"Stage 2: {len(cached_results)} cached, {len(uncached_papers)} need evaluation"
        )


        # Evaluate uncached papers in parallel
		if uncached_papers:
		    # 1. Fetch full paper HTML
		    paper_ids = [paper["id"] for paper in uncached_papers]
		    html_results = await self.html_crawler.fetch_batch(paper_ids)
		
		    # 2. Extract cleaned full text
		    papers_with_text = []
		
		    for paper in uncached_papers:
		        html = html_results.get(paper["id"])

				if html:
				    # Cache raw HTML on the paper object for reuse by Stage 3.
				    # JSONExporter only exports known paper fields, so this will not
				    # be included in digest.json.
				    paper["_full_html"] = html
				
				    cleaner = ArxivHtmlCleaner(
				        max_chars=self.max_text_chars,
				        arxiv_id=paper["id"],
				    )
				    full_text = cleaner.clean(html)
				else:
				    logger.warning(
				        f"Stage 2: HTML unavailable for {paper['id']}, "
				        "falling back to abstract"
				    )
				    full_text = paper["abstract"]
		        papers_with_text.append((paper, full_text))
		
		    # 3. Build Stage 2 LLM messages using full paper text
		    batch_messages = [
		        self.llm_client.build_stage2_messages(
		            title=paper["title"],
		            authors=paper["authors"],
		            categories=paper["categories"],
		            abstract=paper["abstract"],
		            full_text=full_text,
		            user_prompt=user_prompt,
		            custom_fields=self.custom_fields,
		        )
		        for paper, full_text in papers_with_text
		    ]
		
		    # 4. Call LLM in parallel
		    results = await self.llm_client.complete_batch(
		        batch_messages,
		        Stage2Result,
		        temperature=self.temperature,
		    )
		
		    # 5. Convert results to dictionaries and cache them
		    evaluated_results = []
		
		    for (paper, _), messages, result in zip(
		        papers_with_text,
		        batch_messages,
		        results,
		        strict=True,
		    ):
		        if result is None:
		            logger.warning(
		                f"Stage 2: Paper {paper['id']} failed LLM call, "
		                "marking as not passed"
		            )
		
		            result_dict = {
		                "pass_filter": False,
		                "score": 0.0,
		                "reasoning": "LLM call failed",
		                "custom_fields": {},
		                "messages": messages,
		                "usage": None,
		                "estimated_cost": None,
		                "estimated_cost_currency": None,
		            }
		        else:
		            result_obj, usage, cost_info = result
		            result_dict = prepare_result_with_conversation(
		                result_obj,
		                self.threshold,
		                messages,
		                usage,
		                cost_info,
		            )
		
		        self.cache_manager.set(
		            2,
		            paper["id"],
		            result_dict,
		            self.config_hash,
		        )
		        evaluated_results.append((paper, result_dict))
		
		    # 6. Combine cached and newly evaluated results
		    all_results = cached_results + evaluated_results
		else:
		    all_results = cached_results

       

        # Log statistics
        passed = sum(1 for _, result in all_results if result["pass_filter"])
        logger.info(
            f"Stage 2 complete: {passed}/{len(papers)} papers passed ({passed / len(papers) * 100:.1f}%)"
        )

        return all_results
