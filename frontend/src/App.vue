<script setup lang="ts">
import { ref } from "vue";
import { useDigest } from "@/composables/useDigest";
import PaperCard from "@/components/PaperCard.vue";
import ConversationModal from "@/components/ConversationModal.vue";
import DateNavigator from "@/components/DateNavigator.vue";
import LocalHistoryManager from "@/components/LocalHistoryManager.vue";

const {
    digestData,
    loading,
    error,
    currentStage,
    selectedPaper,
    showModal,
    currentDigestDate,
    allAvailableDates,
    hiddenTimestamps,
    pendingHiddenTimestamp,
    isHistoryManagerOpen,
    hasLocalPassword,
    filteredPapers,
    stageName,
    handleDateChange,
    requestHideTimestamp,
    confirmHideTimestamp,
    restoreHiddenTimestamp,
    resetLocalHistory,
    showConversation,
    closeModal,
} = useDigest();

const localHistoryError = ref<string | null>(null);

function requestHide(timestamp: string) {
    localHistoryError.value = null;
    requestHideTimestamp(timestamp);
}

async function confirmHide(credentials: { password: string; passwordConfirmation?: string }) {
    localHistoryError.value = null;
    const result = await confirmHideTimestamp(
        credentials.password,
        credentials.passwordConfirmation,
    );
    if (!result.ok) {
        localHistoryError.value = result.error ?? "Unable to hide this history item";
    }
}

function restoreHidden(timestamp: string) {
    localHistoryError.value = null;
    if (!restoreHiddenTimestamp(timestamp)) {
        localHistoryError.value =
            "Unable to restore local history because browser storage is unavailable";
    }
}

function resetHistory() {
    localHistoryError.value = null;
    if (!resetLocalHistory()) {
        localHistoryError.value =
            "Unable to reset local history because browser storage is unavailable";
    }
}

function openLocalHistoryManager() {
    localHistoryError.value = null;
    isHistoryManagerOpen.value = true;
}

function closeLocalHistoryManager() {
    localHistoryError.value = null;
    pendingHiddenTimestamp.value = null;
    isHistoryManagerOpen.value = false;
}
</script>

<template>
    <div v-if="error" class="error">
        <FontAwesomeIcon icon="times-circle" style="margin-right: 10px" />
        Error: {{ error }}
    </div>

    <div v-else-if="digestData" class="container">
        <header>
            <h1>
                {{ digestData.metadata.title }}
            </h1>

            <div class="header-controls">
                <span class="generated-label">Generated on</span>

                <DateNavigator
                    v-if="currentDigestDate"
                    :current-date="currentDigestDate"
                    :available-dates="allAvailableDates"
                    @change="handleDateChange"
                    @hide="requestHide"
                    @manage-local-history="openLocalHistoryManager"
                />
            </div>
        </header>

        <div class="controls">
            <div class="stage-selector">
                <button
                    class="stage-btn"
                    :class="{ active: currentStage === 'all' }"
                    @click="currentStage = 'all'"
                >
                    All Papers ({{ digestData.metadata.stats.total_papers }})
                </button>

                <button
                    class="stage-btn"
                    :class="{ active: currentStage === '1' }"
                    @click="currentStage = '1'"
                >
                    Stage 1+ ({{ digestData.metadata.stats.stage1_passed }})
                </button>

                <button
                    class="stage-btn"
                    :class="{ active: currentStage === '2' }"
                    @click="currentStage = '2'"
                >
                    Stage 2+ ({{ digestData.metadata.stats.stage2_passed }})
                </button>

                <button
                    class="stage-btn"
                    :class="{ active: currentStage === '3' }"
                    @click="currentStage = '3'"
                >
                    Stage 3 ({{ digestData.metadata.stats.stage3_passed }})
                </button>
            </div>

            <div class="stats">
                <div class="stat">
                    <span>Total:</span>
                    <span class="stat-value">{{ filteredPapers.length }}</span>
                </div>

                <div class="stat">
                    <span>Showing:</span>
                    <span class="stat-value">{{ stageName }}</span>
                </div>
            </div>
        </div>

        <div class="papers-container">
            <div v-if="filteredPapers.length === 0" class="no-papers">
                <div class="no-papers-icon">📭</div>
                <h2>No papers found</h2>
                <p>Try selecting a different filter</p>
            </div>

            <PaperCard
                v-for="paper in filteredPapers"
                :key="paper.arxiv_id"
                :paper="paper"
                @show-conversation="showConversation"
            />
        </div>

        <footer>
            <p>{{ digestData.metadata.title }} | Three-Stage Progressive Filtering System</p>
            <p>
                Stage 1: Title + Categories | Stage 2: + Authors + Abstract | Stage 3: + Full Paper
                Analysis
            </p>
        </footer>

        <ConversationModal
            v-if="showModal && selectedPaper"
            :paper="selectedPaper"
            @close="closeModal"
        />
    </div>

    <div v-else-if="!loading" class="container no-history-records">
        <h1>No visible local history records</h1>
        <p>Hidden records remain available in local history management.</p>
        <button type="button" @click="openLocalHistoryManager">Manage local history</button>
    </div>

    <LocalHistoryManager
        v-if="pendingHiddenTimestamp || isHistoryManagerOpen"
        :pending-timestamp="pendingHiddenTimestamp"
        :hidden-timestamps="hiddenTimestamps"
        :has-password="hasLocalPassword"
        :error="localHistoryError"
        @confirm-hide="confirmHide"
        @restore="restoreHidden"
        @reset="resetHistory"
        @close="closeLocalHistoryManager"
    />
</template>
