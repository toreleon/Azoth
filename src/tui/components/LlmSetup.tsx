import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { loadConfig, updateConfig } from "../../config/loader.js";
import { saveLlmEnvironment } from "../../runtime/llmSetup.js";
import { azothPaths } from "../../runtime/paths.js";
import { theme } from "../lib/theme.js";

type Step = "apiKey" | "baseUrl" | "model" | "done";

export interface LlmSetupProps {
  onComplete: () => void;
}

export function LlmSetup({ onComplete }: LlmSetupProps) {
  const cfg = loadConfig();
  const paths = azothPaths();
  const [step, setStep] = useState<Step>("apiKey");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(process.env.ANTHROPIC_BASE_URL ?? "");
  const [model, setModel] = useState(cfg.model);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [savedEnv, setSavedEnv] = useState<string | undefined>();

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
      setStep("baseUrl");
      return;
    }

    if (step === "baseUrl") {
      setBaseUrl(value);
      setInput("");
      setStep("model");
      return;
    }

    if (step === "model") {
      const nextModel = value || cfg.model;
      try {
        const envPath = saveLlmEnvironment({ apiKey, baseUrl });
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
      ? "Anthropic-compatible API key"
      : step === "baseUrl"
        ? "Base URL"
        : step === "model"
          ? "Model"
          : "";
  const placeholder =
    step === "apiKey"
      ? "sk-..."
      : step === "baseUrl"
        ? "optional, press Enter to skip"
        : step === "model"
          ? cfg.model
          : "";

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor={theme.accent} paddingX={1} flexDirection="column">
        <Text color={theme.accent} bold>Azoth first-time LLM setup</Text>
        <Text dimColor>Azoth uses the Claude Agent SDK with Anthropic-compatible environment variables.</Text>
        <Box marginTop={1} flexDirection="column">
          <Text><Text dimColor>env    </Text>{paths.env}</Text>
          <Text><Text dimColor>config </Text>{paths.config}</Text>
        </Box>

        {step !== "done" ? (
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
            {step === "baseUrl" ? <Text dimColor>Use this for OpenAI-compatible gateways such as Z.ai. Leave blank for Anthropic.</Text> : null}
            {step === "model" ? <Text dimColor>This updates model, team.quick_model, and team.deep_model.</Text> : null}
          </Box>
        ) : (
          <Box marginTop={1} flexDirection="column">
            <Text color={theme.up} bold>LLM environment saved.</Text>
            <Text><Text dimColor>env    </Text>{savedEnv}</Text>
            <Text><Text dimColor>model  </Text>{model}</Text>
            <Box marginTop={1}>
              <Text color={theme.brand} bold>Press Enter to start Azoth</Text>
            </Box>
            <TextInput value="" onChange={() => {}} onSubmit={finish} />
          </Box>
        )}

        {error ? <Text color={theme.down}>✗ {error}</Text> : null}
      </Box>
    </Box>
  );
}

