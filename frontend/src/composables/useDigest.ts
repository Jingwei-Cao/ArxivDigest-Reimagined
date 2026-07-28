import { ref, computed, watch, onMounted } from "vue";
import { loadDigestData, loadHistoryIndex } from "@/utils/digestLoader";
import {
    configureLocalHistoryPassword,
    hideTimestamp,
    loadLocalHistoryPreferences,
    resetLocalHistoryPreferences,
    restoreTimestamp,
    verifyLocalHistoryPassword,
} from "@/utils/localHistoryPreferences";
import type { DigestData, Paper } from "@/types/digest";

export function useDigest() {
    const digestData = ref<DigestData | null>(null);
    const loading = ref(true);
    const error = ref<string | null>(null);
    const currentStage = ref<string>("all");
    const selectedPaper = ref<Paper | null>(null);
    const showModal = ref(false);

    // History support
    const historyDates = ref<string[]>([]);
    const selectedDate = ref<string>(""); // Empty string means "Latest"
    const latestDateString = ref<string>("");
    const hiddenTimestamps = ref(loadLocalHistoryPreferences().hiddenTimestamps);
    const pendingHiddenTimestamp = ref<string | null>(null);
    const isHistoryManagerOpen = ref(false);
    const hasLocalPassword = ref(loadLocalHistoryPreferences().password !== null);
    const visibleDates = computed(() =>
        historyDates.value.filter((timestamp) => !hiddenTimestamps.value.includes(timestamp)),
    );
    let loadVersion = 0;
    let hideOperationVersion = 0;
    const storageError = "Browser storage is unavailable; no local history changes were saved";

    watch(
        pendingHiddenTimestamp,
        () => {
            hideOperationVersion++;
        },
        { flush: "sync" },
    );

    // Helper to format date
    const formatDateFromTimestamp = (timestamp: string) => {
        const date = new Date(timestamp);
        const yyyy = date.getUTCFullYear();
        const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(date.getUTCDate()).padStart(2, "0");
        const hh = String(date.getUTCHours()).padStart(2, "0");
        const min = String(date.getUTCMinutes()).padStart(2, "0");
        const ss = String(date.getUTCSeconds()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`;
    };

    // Load data
    const loadData = async (date?: string) => {
        const requestVersion = ++loadVersion;
        loading.value = true;
        error.value = null;
        try {
            const data = await loadDigestData(date);
            if (
                requestVersion !== loadVersion ||
                (date !== undefined &&
                    (selectedDate.value !== date || !visibleDates.value.includes(date)))
            ) {
                return;
            }
            digestData.value = data;

            // Reset stage selection logic when data changes
            if (digestData.value.metadata.stats.stage3_passed > 0) {
                currentStage.value = "3";
            } else if (digestData.value.metadata.stats.stage2_passed > 0) {
                currentStage.value = "2";
            } else if (digestData.value.metadata.stats.stage1_passed > 0) {
                currentStage.value = "1";
            } else {
                currentStage.value = "all";
            }
        } catch (e) {
            if (requestVersion === loadVersion) {
                error.value = e instanceof Error ? e.message : "Failed to load digest data";
            }
        } finally {
            if (requestVersion === loadVersion) {
                loading.value = false;
            }
        }
    };

    // Handle date change from navigator
    const handleDateChange = (newDate: string) => {
        if (visibleDates.value.length > 0) {
            // If history exists, we rely on it.
            selectedDate.value = visibleDates.value.includes(newDate)
                ? newDate
                : (visibleDates.value[0] ?? "");
        } else {
            // Fallback mode: if no history, we might be using digest.json
            if (newDate === latestDateString.value) {
                selectedDate.value = "";
            } else {
                selectedDate.value = ""; // Default to latest
            }
        }
    };

    // Watch for date changes
    watch(selectedDate, (newDate) => {
        if (historyDates.value.length > 0 && visibleDates.value.length === 0) {
            return;
        }
        if (newDate && !visibleDates.value.includes(newDate)) {
            return;
        }
        loadData(newDate || undefined);
    });

    // Load initial data
    onMounted(async () => {
        // Load history index first
        historyDates.value = await loadHistoryIndex();
        // Sort dates descending (newest first)
        historyDates.value.sort((a, b) => b.localeCompare(a));

        if (visibleDates.value.length > 0) {
            // If history exists, use the latest history file as the source of truth
            const latest = visibleDates.value[0];
            if (latest) {
                selectedDate.value = latest;
                latestDateString.value = latest;
            }
        } else if (historyDates.value.length === 0) {
            // Fallback: Load digest.json if no history is available
            await loadData();
            if (digestData.value) {
                latestDateString.value = formatDateFromTimestamp(
                    digestData.value.metadata.timestamp,
                );
            }
        } else {
            // Indexed records exist, but this browser has hidden every one of them.
            loading.value = false;
        }
    });

    // Current displayed date (YYYY-MM-DD HH:MM:SS)
    const currentDigestDate = computed(() => {
        if (!digestData.value) return "";

        // If we are viewing a history file, selectedDate will be set
        if (selectedDate.value) return selectedDate.value;

        // If we are viewing latest, use the stored latestDateString or construct it
        if (latestDateString.value) return latestDateString.value;

        return formatDateFromTimestamp(digestData.value.metadata.timestamp);
    });

    // All available dates including the latest one
    const allAvailableDates = computed(() => {
        const dates = new Set([...visibleDates.value]);
        if (historyDates.value.length === 0 && latestDateString.value) {
            dates.add(latestDateString.value);
        } else if (historyDates.value.length === 0 && currentDigestDate.value) {
            // Fallback if latestDateString not yet set but we have data
            dates.add(currentDigestDate.value);
        }
        return Array.from(dates).sort((a, b) => b.localeCompare(a));
    });

    // Filtered papers based on current stage
    const filteredPapers = computed(() => {
        if (!digestData.value) return [];
        if (currentStage.value === "all") return digestData.value.papers;

        const minStage = parseInt(currentStage.value);
        return digestData.value.papers.filter((paper) => paper.max_stage >= minStage);
    });

    // Stage names for display
    const stageName = computed(() => {
        const names: Record<string, string> = {
            all: "All Papers",
            "1": "Stage 1+",
            "2": "Stage 2+",
            "3": "Stage 3",
        };
        return names[currentStage.value] || "All Papers";
    });

    // Show conversation modal
    function showConversation(paper: Paper) {
        selectedPaper.value = paper;
        showModal.value = true;
    }

    // Close conversation modal
    function closeModal() {
        showModal.value = false;
        selectedPaper.value = null;
    }

    function requestHideTimestamp(timestamp: string) {
        if (!visibleDates.value.includes(timestamp)) {
            return;
        }
        pendingHiddenTimestamp.value = timestamp;
    }

    async function confirmHideTimestamp(password: string, passwordConfirmation?: string) {
        const timestamp = pendingHiddenTimestamp.value;
        if (!timestamp) {
            return { ok: false, error: "No timestamp selected" };
        }
        const operationVersion = hideOperationVersion;
        const operationIsCurrent = () =>
            operationVersion === hideOperationVersion && pendingHiddenTimestamp.value === timestamp;

        if (!hasLocalPassword.value) {
            if (!password || password !== passwordConfirmation) {
                return { ok: false, error: "Passwords do not match" };
            }
            const configured = await configureLocalHistoryPassword(password, operationIsCurrent);
            if (!operationIsCurrent()) {
                return { ok: false, error: "Hide operation was cancelled" };
            }
            if (!configured) {
                return { ok: false, error: storageError };
            }
            hasLocalPassword.value = true;
        } else {
            const verified = await verifyLocalHistoryPassword(password);
            if (!operationIsCurrent()) {
                return { ok: false, error: "Hide operation was cancelled" };
            }
            if (!verified) {
                return { ok: false, error: "Incorrect password" };
            }
        }

        if (!operationIsCurrent()) {
            return { ok: false, error: "Hide operation was cancelled" };
        }
        if (!hideTimestamp(timestamp)) {
            return { ok: false, error: storageError };
        }
        if (selectedDate.value === timestamp) {
            loadVersion++;
        }
        hiddenTimestamps.value = loadLocalHistoryPreferences().hiddenTimestamps;
        pendingHiddenTimestamp.value = null;

        if (selectedDate.value === timestamp) {
            const nextVisibleDate = visibleDates.value[0] ?? "";
            selectedDate.value = nextVisibleDate;
            if (!nextVisibleDate) {
                digestData.value = null;
                loading.value = false;
            }
        }

        return { ok: true };
    }

    function restoreHiddenTimestamp(timestamp: string) {
        if (!restoreTimestamp(timestamp)) {
            return false;
        }
        hiddenTimestamps.value = loadLocalHistoryPreferences().hiddenTimestamps;
        if (!selectedDate.value) {
            selectedDate.value = visibleDates.value[0] ?? "";
        }
        return true;
    }

    function resetLocalHistory() {
        pendingHiddenTimestamp.value = null;
        if (!resetLocalHistoryPreferences()) {
            return false;
        }
        hiddenTimestamps.value = [];
        hasLocalPassword.value = false;
        if (!selectedDate.value) {
            selectedDate.value = visibleDates.value[0] ?? "";
        }
        return true;
    }

    return {
        digestData,
        loading,
        error,
        currentStage,
        selectedPaper,
        showModal,
        historyDates,
        visibleDates,
        hiddenTimestamps,
        selectedDate,
        pendingHiddenTimestamp,
        isHistoryManagerOpen,
        hasLocalPassword,
        currentDigestDate,
        allAvailableDates,
        filteredPapers,
        stageName,
        handleDateChange,
        requestHideTimestamp,
        confirmHideTimestamp,
        restoreHiddenTimestamp,
        resetLocalHistory,
        showConversation,
        closeModal,
    };
}

