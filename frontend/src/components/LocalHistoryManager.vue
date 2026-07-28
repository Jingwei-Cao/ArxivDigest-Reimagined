<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";

const props = withDefaults(
    defineProps<{
        pendingTimestamp: string | null;
        hiddenTimestamps: string[];
        hasPassword: boolean;
        error?: string | null;
    }>(),
    { error: null },
);

const emit = defineEmits<{
    (e: "confirm-hide", credentials: { password: string; passwordConfirmation?: string }): void;
    (e: "restore", timestamp: string): void;
    (e: "reset"): void;
    (e: "close"): void;
}>();

const password = ref("");
const passwordConfirmation = ref("");
const confirmingReset = ref(false);
const dialog = ref<HTMLElement | null>(null);
let previouslyFocused: HTMLElement | null = null;

function focusableElements() {
    return Array.from(
        dialog.value?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), [href], select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
    );
}

function focusFirstElement() {
    focusableElements()[0]?.focus();
}

function formatTimestamp(timestamp: string) {
    const [date, time] = timestamp.split("_");
    return time ? `${date} ${time.replace(/-/g, ":")}` : timestamp;
}

function clearCredentials() {
    password.value = "";
    passwordConfirmation.value = "";
}

function confirmHide() {
    const credentials = props.hasPassword
        ? { password: password.value }
        : { password: password.value, passwordConfirmation: passwordConfirmation.value };
    emit("confirm-hide", credentials);
    clearCredentials();
}

function close() {
    clearCredentials();
    confirmingReset.value = false;
    previouslyFocused?.focus();
    emit("close");
}

function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
        close();
    }
}

function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
    }

    if (event.key !== "Tab") {
        if (dialog.value && !dialog.value.contains(event.target as Node)) {
            event.preventDefault();
            focusFirstElement();
        }
        return;
    }

    const focusable = focusableElements();
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) {
        event.preventDefault();
        return;
    }

    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    } else if (!dialog.value?.contains(document.activeElement)) {
        event.preventDefault();
        focusFirstElement();
    }
}

onMounted(() => {
    previouslyFocused =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void nextTick(focusFirstElement);
    window.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
    window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
    <div class="local-history-modal" @click="handleBackdropClick">
        <section
            ref="dialog"
            class="local-history-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="local-history-title"
        >
            <header class="local-history-header">
                <h2 id="local-history-title">
                    {{
                        props.pendingTimestamp ? "Hide local history item" : "Manage local history"
                    }}
                </h2>
            </header>
            <p v-if="props.error" class="form-error" role="alert">{{ props.error }}</p>

            <form v-if="props.pendingTimestamp" @submit.prevent="confirmHide">
                <p>
                    Hide {{ formatTimestamp(props.pendingTimestamp) }} from this browser's digest
                    history.
                </p>
                <p v-if="!props.hasPassword" class="password-heading">
                    Set local management password
                </p>
                <p v-else class="password-heading">Enter local management password</p>
                <label>
                    Password
                    <input
                        v-model="password"
                        name="password"
                        type="password"
                        autocomplete="current-password"
                        required
                    />
                </label>
                <label v-if="!props.hasPassword">
                    Confirm password
                    <input
                        v-model="passwordConfirmation"
                        name="passwordConfirmation"
                        type="password"
                        autocomplete="new-password"
                        required
                    />
                </label>
                <div class="dialog-actions">
                    <button type="button" class="secondary" @click="close">Cancel</button>
                    <button type="submit" class="danger">Hide item</button>
                </div>
            </form>

            <div v-else>
                <p v-if="props.hiddenTimestamps.length === 0">No hidden local history items.</p>
                <ul v-else class="hidden-list">
                    <li v-for="timestamp in props.hiddenTimestamps" :key="timestamp">
                        <span>{{ formatTimestamp(timestamp) }}</span>
                        <button
                            type="button"
                            :aria-label="`Restore ${formatTimestamp(timestamp)}`"
                            @click="emit('restore', timestamp)"
                        >
                            Restore
                        </button>
                    </li>
                </ul>

                <div v-if="confirmingReset" class="reset-confirmation" role="alert">
                    <p>Reset the local management password and restore all hidden items?</p>
                    <button type="button" class="secondary" @click="confirmingReset = false">
                        Cancel
                    </button>
                    <button
                        type="button"
                        class="danger"
                        aria-label="Confirm reset local history"
                        @click="emit('reset')"
                    >
                        Reset local history
                    </button>
                </div>
                <button
                    v-else
                    type="button"
                    class="danger"
                    aria-label="Reset local history"
                    @click="confirmingReset = true"
                >
                    Reset local history
                </button>
            </div>
        </section>
    </div>
</template>

<style scoped>
.local-history-modal {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    padding: 1rem;
    background: rgba(15, 23, 42, 0.55);
}

.local-history-dialog {
    width: min(100%, 32rem);
    max-height: calc(100dvh - 2rem);
    overflow: auto;
    border-radius: 0.75rem;
    background: #fff;
    color: #1e293b;
    padding: 1.25rem;
    box-shadow: 0 20px 30px rgba(15, 23, 42, 0.2);
}

.local-history-header,
.hidden-list li,
.dialog-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
}

.local-history-header h2 {
    margin: 0;
    font-size: 1.2rem;
}
.close-button {
    border: 0;
    background: transparent;
    font-size: 1.5rem;
    cursor: pointer;
}
form {
    display: grid;
    gap: 0.75rem;
}
label {
    display: grid;
    gap: 0.25rem;
    font-weight: 600;
}
input {
    border: 1px solid #94a3b8;
    border-radius: 0.375rem;
    padding: 0.5rem;
    font: inherit;
}
.password-heading {
    margin-bottom: 0;
    font-weight: 600;
}
.form-error {
    color: #b91c1c;
    margin: 0;
}
.dialog-actions {
    margin-top: 0.5rem;
    justify-content: flex-end;
}
button {
    border: 0;
    border-radius: 0.375rem;
    cursor: pointer;
    font: inherit;
    padding: 0.45rem 0.7rem;
}
.secondary {
    background: #e2e8f0;
    color: #1e293b;
}
.danger {
    background: #b91c1c;
    color: #fff;
}
.hidden-list {
    display: grid;
    gap: 0.5rem;
    list-style: none;
    max-height: min(20rem, 45dvh);
    overflow-y: auto;
    margin: 1rem 0;
    padding: 0;
}
.hidden-list li {
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 0.5rem;
}
.hidden-list button {
    background: #dbeafe;
    color: #1d4ed8;
}
.reset-confirmation {
    display: grid;
    gap: 0.5rem;
    margin-top: 1rem;
}
</style>
