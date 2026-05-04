import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { loadConfig, updateConfig } from "../../config/loader.js";
import { saveLlmEnvironment } from "../../runtime/llmSetup.js";
import { azothPaths } from "../../runtime/paths.js";
import { theme } from "../lib/theme.js";
import { AZOTH_LOGO } from "./Welcome.js";

type Provider = "anthropic" | "compatible";
type Step = "provider" | "apiKey" | "baseUrl" | "model" | "done";

const PROVIDERS: Array<{ id: Provider; label: string; detail: string }> = [
  { id: "anthropic", label: "Anthropic API key", detail: "Use Anthropic directly; no base URL needed." },
  { id: "compatible", label: "Anthropic-compatible provider", detail: "Use a compatible gateway; configure ANTHROPIC_BASE_URL." },
];

export interface LlmSetupProps {
  onComplete: () => void;
}

export function LlmSetup({ onComplete }: LlmSetupProps) {
  const cfg = loadConfig();
  const paths = azothPaths();
  const [step, setStep] = useState<Step>("provider");
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [providerIdx, setProviderIdx] = useState(0);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(process.env.ANTHROPIC_BASE_URL ?? "");
  const [model, setModel] = useState(cfg.model);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [savedEnv, setSavedEnv] = useState<string | undefined>();

  useInput((inp, key) => {
    if (step === "provider") {
      if (key.upArrow || key.leftArrow) setProviderIdx((idx) => (idx - 1 + PROVIDERS.length) % PROVIDERS.length);
      if (key.downArrow || key.rightArrow || key.tab) setProviderIdx((idx) => (idx + 1) % PROVIDERS.length);
      if (key.return) {
        const selected = PROVIDERS[providerIdx]!;
        setProvider(selected.id);
        setStep("apiKey");
      }
      if (inp === "1" || inp.toLowerCase() === "a") {
        setProvider("anthropic");
        setProviderIdx(0);
        setStep("apiKey");
      }
      if (inp === "2" || inp.toLowerCase() === "c") {
        setProvider("compatible");
        setProviderIdx(1);
        setStep("apiKey");
      }
    }
  });

  const submit = (raw: string) => {
    const value = raw.trim();
    setError(undefined);

    if (step === "apiKey") {
      if (!value) {
        setError("API key is required.");
        return;
      }
      setApiKey(value);
      setInput("");
      setStep(provider === "compatible" ? "baseUrl" : "model");
      return;
    }

    if (step === "baseUrl") {
      if (!value) {
        setError("Base URL is required for Anthropic-compatible providers.");
        return;
      }
      setBaseUrl(value);
      setInput("");
      setStep("model");
      return;
    }

    if (step === "model") {
      const nextModel = value || cfg.model;
      try {
        const envPath = saveLlmEnvironment({
          apiKey,
          baseUrl: provider === "compatible" ? baseUrl : undefined,
        });
        updateConfig({
          model: nextModel,
          team: {
            ...cfg.team,
            quick_model: nextModel,
            deep_model: nextModel,
          },
        });
        setModel(nextModel);
        setSavedEnv(envPath);
        setInput("");
        setStep("done");
      } catch (e) {
        setError((e as Error).message);
      }
    }
  };

  const finish = () => onComplete();

  const label =
    step === "apiKey"
      ? PROVIDERS.find((p) => p.id === provider)!.label
      : step === "baseUrl"
        ? "ANTHROPIC_BASE_URL"
        : step === "model"
          ? "Model"
          : "";
  const placeholder =
    step === "apiKey"
      ? "sk-..."
      : step === "baseUrl"
        ? "https://provider.example.com/api/anthropic"
        : step === "model"
          ? cfg.model
          : "";

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor={theme.accent} paddingX={1} flexDirection="column">
        <Box flexDirection="column">
          {AZOTH_LOGO.map((line, i) => (
            <Text key={i} color={theme.accent} bold>{line}</Text>
          ))}
          <Box marginTop={1}>
            <Text color={theme.muted}>Azoth first-time LLM setup</Text>
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text><Text dimColor>env    </Text>{paths.env}</Text>
            <Text><Text dimColor>config </Text>{paths.config}</Text>
          </Box>
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.accent} bold>LLM Environment</Text>
          <Text dimColor>Configure the Claude Agent SDK runtime before Azoth starts.</Text>

          {step === "provider" ? (
            <Box marginTop={1} flexDirection="column">
              <Text color={theme.brand} bold>Select provider</Text>
              {PROVIDERS.map((p, i) => (
                <Text key={p.id}>
                  <Text color={i === providerIdx ? theme.accent : theme.muted} bold>{i === providerIdx ? "› " : "  "}</Text>
                  <Text color={i === providerIdx ? "white" : undefined}>{i + 1}. {p.label}</Text>
                  <Text dimColor>  {p.detail}</Text>
                </Text>
              ))}
              <Text dimColor>↑/↓ select · Enter confirm · 1/2 quick select</Text>
            </Box>
          ) : null}

          {step !== "provider" && step !== "done" ? (
            <Box marginTop={1} flexDirection="column">
              <Text color={theme.brand} bold>{label}</Text>
              <Box borderStyle="round" borderColor={error ? theme.down : theme.muted} paddingX={1}>
                <TextInput
                  value={input}
                  onChange={setInput}
                  onSubmit={submit}
                  placeholder={placeholder}
                  mask={step === "apiKey" ? "*" : undefined}
                />
              </Box>
              {step === "baseUrl" ? <Text dimColor>Required only for Anthropic-compatible providers.</Text> : null}
              {step === "model" ? <Text dimColor>This updates model, team.quick_model, and team.deep_model.</Text> : null}
            </Box>
          ) : null}

          {step === "done" ? (
            <Box marginTop={1} flexDirection="column">
              <Text color={theme.up} bold>LLM environment saved.</Text>
              <Text><Text dimColor>provider </Text>{PROVIDERS.find((p) => p.id === provider)!.label}</Text>
              <Text><Text dimColor>env      </Text>{savedEnv}</Text>
              {provider === "compatible" ? <Text><Text dimColor>base URL </Text>{baseUrl}</Text> : null}
              <Text><Text dimColor>model    </Text>{model}</Text>
              <Box marginTop={1}>
                <Text color={theme.brand} bold>Press Enter to start Azoth</Text>
              </Box>
              <TextInput value="" onChange={() => {}} onSubmit={finish} />
            </Box>
          ) : null}

          {error ? <Text color={theme.down}>✗ {error}</Text> : null}
        </Box>
      </Box>
    </Box>
  );
}
