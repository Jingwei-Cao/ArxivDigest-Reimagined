export type LocalPasswordVerifier = { salt: string; verifier: string };

export type LocalHistoryPreferences = {
    hiddenTimestamps: string[];
    password: LocalPasswordVerifier | null;
};

const STORAGE_KEY = "arxivdigest.local-history.v1";
const EMPTY_PREFERENCES: LocalHistoryPreferences = { hiddenTimestamps: [], password: null };
const PBKDF2_ITERATIONS = 100_000;
const DERIVED_KEY_LENGTH = 256;
const FULL_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/;

function emptyPreferences(): LocalHistoryPreferences {
    return { hiddenTimestamps: [], password: null };
}

function isFullTimestamp(value: string): boolean {
    return FULL_TIMESTAMP_PATTERN.test(value);
}

function isPasswordVerifier(value: unknown): value is LocalPasswordVerifier {
    if (
        typeof value !== "object" ||
        value === null ||
        !("salt" in value) ||
        !("verifier" in value) ||
        typeof value.salt !== "string" ||
        typeof value.verifier !== "string"
    ) {
        return false;
    }

    try {
        return (
            base64ToBytes(value.salt).length === 16 &&
            base64ToBytes(value.verifier).length === 32
        );
    } catch {
        return false;
    }
}

function isPreferences(value: unknown): value is LocalHistoryPreferences {
    return (
        typeof value === "object" &&
        value !== null &&
        "hiddenTimestamps" in value &&
        Array.isArray(value.hiddenTimestamps) &&
        value.hiddenTimestamps.every((timestamp) => typeof timestamp === "string") &&
        "password" in value &&
        (value.password === null || isPasswordVerifier(value.password))
    );
}

function save(preferences: LocalHistoryPreferences): boolean {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
        return true;
    } catch {
        return false;
    }
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveVerifier(password: string, salt: Uint8Array): Promise<string> {
    const passwordMaterial = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"],
    );

    const derivedBits = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            hash: "SHA-256",
            salt: new Uint8Array(salt),
            iterations: PBKDF2_ITERATIONS,
        },
        passwordMaterial,
        DERIVED_KEY_LENGTH,
    );

    return bytesToBase64(new Uint8Array(derivedBits));
}

export function loadLocalHistoryPreferences(): LocalHistoryPreferences {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === null) {
            return emptyPreferences();
        }

        const parsed: unknown = JSON.parse(stored);
        if (!isPreferences(parsed)) {
            return emptyPreferences();
        }

        return {
            hiddenTimestamps: [...new Set(parsed.hiddenTimestamps.filter(isFullTimestamp))].sort(
                (left, right) => right.localeCompare(left),
            ),
            password: parsed.password === null ? null : { ...parsed.password },
        };
    } catch {
        return emptyPreferences();
    }
}

export async function configureLocalHistoryPassword(
    password: string,
    shouldPersist: () => boolean = () => true,
): Promise<boolean> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const passwordVerifier = {
        salt: bytesToBase64(salt),
        verifier: await deriveVerifier(password, salt),
    };

    if (!shouldPersist()) {
        return false;
    }

    const preferences = loadLocalHistoryPreferences();
    preferences.password = passwordVerifier;
    return save(preferences);
}

export async function verifyLocalHistoryPassword(password: string): Promise<boolean> {
    const configuredPassword = loadLocalHistoryPreferences().password;
    if (configuredPassword === null) {
        return false;
    }

    try {
        const verifier = await deriveVerifier(password, base64ToBytes(configuredPassword.salt));
        return verifier === configuredPassword.verifier;
    } catch {
        return false;
    }
}

export function hideTimestamp(timestamp: string): boolean {
    if (!isFullTimestamp(timestamp)) {
        return false;
    }

    const preferences = loadLocalHistoryPreferences();
    preferences.hiddenTimestamps = [...new Set([...preferences.hiddenTimestamps, timestamp])].sort(
        (left, right) => right.localeCompare(left),
    );
    return save(preferences);
}

export function restoreTimestamp(timestamp: string): boolean {
    const preferences = loadLocalHistoryPreferences();
    preferences.hiddenTimestamps = preferences.hiddenTimestamps.filter(
        (hiddenTimestamp) => hiddenTimestamp !== timestamp,
    );
    return save(preferences);
}

export function resetLocalHistoryPreferences(): boolean {
    return save(EMPTY_PREFERENCES);
}
