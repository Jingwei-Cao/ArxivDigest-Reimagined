<script setup lang="ts">
import { computed, ref } from "vue";
import {
    ChevronLeftIcon,
    ChevronRightIcon,
    CalendarDaysIcon,
    ChevronUpDownIcon,
    CheckIcon,
    TrashIcon,
} from "@heroicons/vue/20/solid";

const props = defineProps<{
    currentDate: string; // YYYY-MM-DD_HH-MM-SS
    availableDates: string[];
}>();

const emit = defineEmits<{
    (e: "change", date: string): void;
    (e: "hide", timestamp: string): void;
    (e: "manage-local-history"): void;
}>();
const dateMenu = ref<HTMLDetailsElement | null>(null);

// Format date for display (YYYY-MM-DD HH:MM:SS)
const formatDate = (dateStr: string) => {
    // Expecting YYYY-MM-DD_HH-MM-SS
    const parts = dateStr.split("_");
    if (parts.length === 2 && parts[1]) {
        const date = parts[0];
        const time = parts[1].replace(/-/g, ":");
        return `${date} ${time}`;
    }
    return dateStr;
};

// useDigest guarantees that the current date is one of the available dates.
const allDates = computed(() => {
    return [...props.availableDates].sort((a, b) => b.localeCompare(a));
});

const currentIndex = computed(() => {
    return allDates.value.indexOf(props.currentDate);
});

const hasPrev = computed(() => {
    return currentIndex.value !== -1 && currentIndex.value < allDates.value.length - 1;
});

const hasNext = computed(() => {
    return currentIndex.value !== -1 && currentIndex.value > 0;
});

const prevDate = computed(() => {
    if (!hasPrev.value) return null;
    return allDates.value[currentIndex.value + 1] || null;
});

const nextDate = computed(() => {
    if (!hasNext.value) return null;
    return allDates.value[currentIndex.value - 1] || null;
});

function navigate(date: string | null) {
    if (date) {
        emit("change", date);
        if (dateMenu.value) {
            dateMenu.value.open = false;
        }
    }
}

function hideDate(timestamp: string) {
    emit("hide", timestamp);
    if (dateMenu.value) {
        dateMenu.value.open = false;
    }
}
</script>

<template>
    <div class="date-navigator">
        <!-- Previous Button -->
        <button
            class="nav-btn"
            :disabled="!hasPrev"
            @click="navigate(prevDate)"
            title="Previous Digest"
        >
            <ChevronLeftIcon class="icon" />
        </button>

        <!-- Date selector with independent, keyboard-reachable row actions. -->
        <details ref="dateMenu" class="date-listbox">
            <summary class="listbox-btn">
                <CalendarDaysIcon class="icon-sm text-white" />
                <span class="date-text">{{ formatDate(currentDate) }}</span>
                <ChevronUpDownIcon class="icon-xs text-secondary" />
            </summary>

            <div class="listbox-options">
                <ul class="date-action-list">
                    <li
                        v-for="date in allDates"
                        :key="date"
                        class="listbox-option"
                        :class="{ 'bg-accent-light': date === currentDate }"
                    >
                        <button
                            type="button"
                            class="select-date-btn"
                            :class="date === currentDate ? 'font-medium' : 'font-normal'"
                            :aria-current="date === currentDate ? 'true' : undefined"
                            :aria-label="`View ${formatDate(date)}`"
                            @click="navigate(date)"
                        >
                            <span class="truncate">{{ formatDate(date) }}</span>
                            <CheckIcon
                                v-if="date === currentDate"
                                class="icon-xs check-icon"
                                aria-hidden="true"
                            />
                        </button>
                        <button
                            type="button"
                            class="hide-date-btn"
                            :aria-label="`Hide ${formatDate(date)}`"
                            @click="hideDate(date)"
                        >
                            <TrashIcon class="icon-xs" aria-hidden="true" />
                            <span>Hide</span>
                        </button>
                    </li>
                </ul>
            </div>
        </details>

        <!-- Next Button -->
        <button
            class="nav-btn"
            :disabled="!hasNext"
            @click="navigate(nextDate)"
            title="Next Digest"
        >
            <ChevronRightIcon class="icon" />
        </button>

        <button class="manage-history-btn" type="button" @click="emit('manage-local-history')">
            Manage local history
        </button>
    </div>
</template>

<style scoped>
.date-navigator {
    display: flex;
    align-items: center;
    gap: 0.25rem;
}

.nav-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    transition: all 0.2s;
}

.nav-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
}

.nav-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
}

.date-listbox {
    position: relative;
    min-width: 180px;
}

.listbox-btn {
    position: relative;
    width: 100%;
    cursor: pointer;
    border-radius: 0.5rem;
    background: transparent;
    padding: 0.25rem 0.5rem;
    padding-right: 0.5rem;
    text-align: left;
    border: 1px solid transparent;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-family: inherit;
    font-size: 0.95rem;
    color: #fff;
    transition: all 0.2s;
    list-style: none;
}

.listbox-btn::-webkit-details-marker {
    display: none;
}

.listbox-btn:hover,
.listbox-btn:focus-visible {
    background: rgba(255, 255, 255, 0.1);
}

.listbox-btn:active {
    outline: none;
    background: rgba(255, 255, 255, 0.15);
}

.date-text {
    font-weight: 600;
    color: #fff;
}

.listbox-options {
    position: absolute;
    margin-top: 0.5rem;
    max-height: 15rem;
    min-width: 18rem;
    overflow: auto;
    border-radius: 0.5rem;
    background: var(--white);
    font-size: 0.9rem;
    box-shadow:
        0 10px 15px -3px rgba(0, 0, 0, 0.1),
        0 4px 6px -2px rgba(0, 0, 0, 0.05);
    z-index: 50;
    color: var(--text-color);
}

.date-action-list {
    list-style: none;
    margin: 0;
    padding: 0.25rem 0;
}

.listbox-option {
    display: flex;
    align-items: stretch;
    color: var(--text-color);
    transition: background-color 0.1s;
}

.bg-accent-light {
    background-color: #eff6ff; /* blue-50 */
}

.text-white {
    color: #ffffff;
}

.text-secondary {
    color: rgba(255, 255, 255, 0.7);
}

.font-medium {
    font-weight: 500;
}

.font-normal {
    font-weight: 400;
}

.select-date-btn,
.hide-date-btn {
    display: flex;
    align-items: center;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font: inherit;
}

.select-date-btn {
    flex: 1;
    justify-content: space-between;
    gap: 0.5rem;
    min-width: 0;
    padding: 0.55rem 0.75rem;
    text-align: left;
}

.select-date-btn:hover,
.select-date-btn:focus-visible {
    background: #eff6ff;
    color: var(--accent-color);
}

.check-icon {
    flex: none;
    color: var(--accent-color);
}

.hide-date-btn {
    gap: 0.25rem;
    padding: 0.55rem 0.75rem;
    border-radius: 0.375rem;
    background: #BFDFD2;
    color: #1e293b;
}

.hide-date-btn:hover,
.hide-date-btn:focus-visible {
    background: #e47a44;
    color: #1e293b;
}

.truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.manage-history-btn {
    border: 0;
    border-radius: 0.375rem;
    background: transparent;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    font: inherit;
    font-size: 0.8rem;
    padding: 0.25rem 0.5rem;
}

.manage-history-btn:hover,
.manage-history-btn:focus-visible {
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
}

.icon {
    width: 1.25rem;
    height: 1.25rem;
}

.icon-sm {
    width: 1rem;
    height: 1rem;
}

.icon-xs {
    width: 0.875rem;
    height: 0.875rem;
}

/* Scrollbar for options */
.listbox-options::-webkit-scrollbar {
    width: 6px;
}

.listbox-options::-webkit-scrollbar-track {
    background: transparent;
}

.listbox-options::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 3px;
}

.listbox-options::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
}
</style>
