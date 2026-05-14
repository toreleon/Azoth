import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { loadConfig, updateConfig } from "../../config/loader.js";
import { azothPaths } from "../../runtime/paths.js";
import { theme } from "../lib/theme.js";
import { AZOTH_LOGO } from "./Welcome.js";

type AuthMode = "openapi" | "session";
type Step =
  | "authMode"
  | "subAccount"
  | "apiKey"
  | "apiSecret"
  | "accessToken"
  | "accessKey"
  | "deviceId"
  | "baseUrl"
  | "accountId"
  | "done";

const DEFAULT_FHSC_BASE_URL = "https://api.vinasecurities.com";

function normalizeFhscBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed === "https://api.finhay.com.vn/gw" ? DEFAULT_FHSC_BASE_URL : trimmed;
}

const AUTH_MODES: Array<{ id: AuthMode; label: string; detail: string }> = [
  { id: "session", label: "FHSC browser session", detail: "Access token, access key, and device id from the FHSC web app." },
  { id: "openapi", label: "FHSC OpenAPI key", detail: "Key/secret from quan-ly-api; may not authorize web /trade routes." },
];

export interface FhscSetupProps {
  onComplete: () => void;
}

export function FhscSetup({ onComplete }: FhscSetupProps) {
  const cfg = loadConfig();
  const paths = azothPaths();
  const initialMode: AuthMode = cfg.fhsc.access_token.trim() && cfg.fhsc.access_key.trim() ? "session" : "openapi";
  const [step, setStep] = useState<Step>("authMode");
  const [authMode, setAuthMode] = useState<AuthMode>(initialMode);
  const [authModeIdx, setAuthModeIdx] = useState(initialMode === "openapi" ? 1 : 0);
  const [subAccountId, setSubAccountId] = useState(cfg.fhsc.sub_account_id);
  const [accountId, setAccountId] = useState(cfg.fhsc.account_id);
  const [baseUrl, setBaseUrl] = useState(normalizeFhscBaseUrl(cfg.fhsc.base_url || DEFAULT_FHSC_BASE_URL));
  const [accessToken, setAccessToken] = useState(cfg.fhsc.access_token);
  const [accessKey, setAccessKey] = useState(cfg.fhsc.access_key);
  const [deviceId, setDeviceId] = useState(cfg.fhsc.device_id);
  const [apiKey, setApiKey] = useState(cfg.fhsc.api_key);
  const [apiSecret, setApiSecret] = useState(cfg.fhsc.api_secret);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [savedConfig, setSavedConfig] = useState<string | undefined>();

  useInput((inp, key) => {
    if (step !== "authMode") return;
    if (key.upArrow || key.leftArrow) setAuthModeIdx((idx) => (idx - 1 + AUTH_MODES.length) % AUTH_MODES.length);
    if (key.downArrow || key.rightArrow || key.tab) setAuthModeIdx((idx) => (idx + 1) % AUTH_MODES.length);
    if (key.return) {
      const selected = AUTH_MODES[authModeIdx]!;
      setAuthMode(selected.id);
      setInput(subAccountId);
      setStep("subAccount");
    }
    if (inp === "1" || inp.toLowerCase() === "s") {
      setAuthMode("session");
      setAuthModeIdx(0);
      setInput(subAccountId);
      setStep("subAccount");
    }
    if (inp === "2" || inp.toLowerCase() === "o") {
      setAuthMode("openapi");
      setAuthModeIdx(1);
      setInput(subAccountId);
      setStep("subAccount");
    }
  });

  const persist = (nextAccountId: string) => {
    updateConfig({
      broker: "fhsc",
      fhsc: {
        sub_account_id: subAccountId,
        account_id: nextAccountId,
        base_url: baseUrl,
        access_token: authMode === "session" ? accessToken : "",
        access_key: authMode === "session" ? accessKey : "",
        device_id: authMode === "session" ? deviceId : "",
        user_id: cfg.fhsc.user_id,
        cust_id: cfg.fhsc.cust_id,
        api_key: authMode === "openapi" ? apiKey : "",
        api_secret: authMode === "openapi" ? apiSecret : "",
      },
    });
    setSavedConfig(paths.config);
    setStep("done");
  };

  const submit = (raw: string) => {
    const value = raw.trim();
    setError(undefined);

    if (step === "subAccount") {
      if (!value) {
        setError("FHSC sub-account ID is required.");
        return;
      }
      setSubAccountId(value);
      setInput(authMode === "openapi" ? apiKey : accessToken);
      setStep(authMode === "openapi" ? "apiKey" : "accessToken");
      return;
    }

    if (step === "apiKey") {
      if (!value) {
        setError("FHSC API key is required.");
        return;
      }
      setApiKey(value);
      setInput(apiSecret);
      setStep("apiSecret");
      return;
    }

    if (step === "apiSecret") {
      if (!value) {
        setError("FHSC API secret is required.");
        return;
      }
      setApiSecret(value);
      setInput(baseUrl);
      setStep("baseUrl");
      return;
    }

    if (step === "accessToken") {
      if (!value) {
        setError("FHSC access token is required.");
        return;
      }
      setAccessToken(value);
      setInput(accessKey);
      setStep("accessKey");
      return;
    }

    if (step === "accessKey") {
      if (!value) {
        setError("FHSC access key is required.");
        return;
      }
      setAccessKey(value);
      setInput(deviceId);
      setStep("deviceId");
      return;
    }

    if (step === "deviceId") {
      setDeviceId(value);
      setInput(baseUrl);
      setStep("baseUrl");
      return;
    }

    if (step === "baseUrl") {
      const nextBaseUrl = normalizeFhscBaseUrl(value || DEFAULT_FHSC_BASE_URL);
      setBaseUrl(nextBaseUrl);
      setInput(accountId);
      setStep("accountId");
      return;
    }

    if (step === "accountId") {
      setAccountId(value);
      setInput("");
      persist(value);
    }
  };

  const label =
    step === "subAccount"
      ? "FHSC sub-account ID"
      : step === "apiKey"
        ? "FHSC API key"
        : step === "apiSecret"
          ? "FHSC API secret"
          : step === "accessToken"
            ? "FHSC access token"
            : step === "accessKey"
              ? "FHSC access key"
              : step === "deviceId"
                ? "FHSC device ID"
                : step === "baseUrl"
                  ? "FHSC base URL"
                  : step === "accountId"
                    ? "FHSC account ID"
                    : "";

  const placeholder =
    step === "subAccount"
      ? "numeric sub-account id"
      : step === "apiKey"
        ? "FHSC OpenAPI key"
        : step === "apiSecret"
          ? "FHSC OpenAPI secret"
          : step === "accessToken"
            ? "Bearer access token"
            : step === "accessKey"
              ? "x-access-key"
              : step === "deviceId"
                ? "optional browser device id"
                : step === "baseUrl"
                  ? DEFAULT_FHSC_BASE_URL
                  : step === "accountId"
                    ? "optional; defaults to sub-account id"
                    : "";

  const secretStep = step === "apiKey" || step === "apiSecret" || step === "accessToken" || step === "accessKey";

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor={theme.accent} paddingX={1} flexDirection="column">
        <Box flexDirection="column">
          {AZOTH_LOGO.map((line, i) => (
            <Text key={i} color={theme.accent} bold>{line}</Text>
          ))}
          <Box marginTop={1}>
            <Text color={theme.muted}>FHSC broker setup</Text>
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text><Text dimColor>config </Text>{paths.config}</Text>
          </Box>
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.accent} bold>FHSC Account</Text>
          <Text dimColor>Configure read-only account, portfolio, order, transaction, and rights history access.</Text>

          {step === "authMode" ? (
            <Box marginTop={1} flexDirection="column">
              <Text color={theme.brand} bold>Authentication method</Text>
              {AUTH_MODES.map((m, i) => (
                <Text key={m.id}>
                  <Text color={i === authModeIdx ? theme.accent : theme.muted} bold>{i === authModeIdx ? "› " : "  "}</Text>
                  <Text color={i === authModeIdx ? "white" : undefined}>{i + 1}. {m.label}</Text>
                  <Text dimColor>  {m.detail}</Text>
                </Text>
              ))}
              <Text dimColor>↑/↓ select · Enter confirm · 1/2 quick select</Text>
            </Box>
          ) : null}

          {step !== "authMode" && step !== "done" ? (
            <Box marginTop={1} flexDirection="column">
              <Text color={theme.brand} bold>{label}</Text>
              <Box borderStyle="round" borderColor={error ? theme.down : theme.muted} paddingX={1}>
                <TextInput
                  value={input}
                  onChange={setInput}
                  onSubmit={submit}
                  placeholder={placeholder}
                  mask={secretStep ? "*" : undefined}
                />
              </Box>
              {step === "baseUrl" ? <Text dimColor>Leave blank to use {DEFAULT_FHSC_BASE_URL}.</Text> : null}
              {step === "accountId" ? <Text dimColor>Leave blank unless FHSC uses a different account id for order history.</Text> : null}
            </Box>
          ) : null}

          {step === "done" ? (
            <Box marginTop={1} flexDirection="column">
              <Text color={theme.up} bold>FHSC broker saved.</Text>
              <Text><Text dimColor>broker      </Text>fhsc</Text>
              <Text><Text dimColor>sub account </Text>{subAccountId}</Text>
              <Text><Text dimColor>auth        </Text>{AUTH_MODES.find((m) => m.id === authMode)!.label}</Text>
              <Text><Text dimColor>base URL    </Text>{baseUrl}</Text>
              {accountId ? <Text><Text dimColor>account ID  </Text>{accountId}</Text> : null}
              <Text><Text dimColor>config      </Text>{savedConfig}</Text>
              <Box marginTop={1}>
                <Text color={theme.brand} bold>Press Enter to return to Azoth</Text>
              </Box>
              <TextInput value="" onChange={() => {}} onSubmit={onComplete} />
            </Box>
          ) : null}

          {error ? <Text color={theme.down}>✗ {error}</Text> : null}
        </Box>
      </Box>
    </Box>
  );
}
