import { useEffect, useState } from "react";
import type React from "react";
import { EyeIcon } from "../Icon.js";
import { availableModelOrDefault } from "../../lib/providerModels.js";

export function PaneShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="settings-pane-header">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export function Group({ children }: { children: React.ReactNode }) {
  return <div className="settings-group">{children}</div>;
}

export function GroupTitle({ children }: { children: React.ReactNode }) {
  return <div className="settings-group-title">{children}</div>;
}

export function SettingRow({
  label,
  hint,
  control,
}: {
  label: string;
  hint?: string;
  control: React.ReactNode;
}) {
  return (
    <div className="settings-row">
      <div>
        <label>{label}</label>
        {hint && <span className="hint">{hint}</span>}
      </div>
      <div className="control">{control}</div>
    </div>
  );
}

export function TextRow({
  label,
  value,
  onChange,
  onBlur,
  className = "w-md",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  className?: string;
}) {
  return (
    <SettingRow
      label={label}
      control={<input className={`mono ${className}`} value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />}
    />
  );
}

export function LocationRow({ label, hint, path }: { label: string; hint: string; path: string }) {
  return (
    <SettingRow
      label={label}
      hint={hint}
      control={
        <>
          <span className="settings-path">{path}</span>
          <button className="settings-btn" onClick={() => undefined}>Reveal</button>
        </>
      }
    />
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="settings-seg" role="radiogroup">
      {options.map((option) => (
        <button
          key={option.value}
          role="radio"
          aria-pressed={value === option.value ? "true" : "false"}
          aria-checked={value === option.value ? "true" : "false"}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      className="settings-toggle"
      role="switch"
      aria-checked={checked ? "true" : "false"}
      onClick={() => onChange(!checked)}
    />
  );
}

export function Slider({
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  const [localValue, setLocalValue] = useState(value);
  useEffect(() => setLocalValue(value), [value]);
  return (
    <div className="slider-row">
      <input
        type="range"
        min={min}
        max={max}
        value={localValue}
        onChange={(e) => setLocalValue(Number(e.target.value))}
        onMouseUp={() => onChange(localValue)}
        onKeyUp={() => onChange(localValue)}
      />
      <span className="slider-num">{localValue.toFixed(1)}{suffix}</span>
    </div>
  );
}

export function ModelSelect({
  models,
  loading,
  error,
  value,
  onChange,
}: {
  models: string[];
  loading: boolean;
  error: string | null;
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  const selected = availableModelOrDefault(models, value);
  const disabled = loading || Boolean(error) || models.length === 0;
  return (
    <select value={disabled ? "" : selected} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {disabled ? (
        <option value="">{loading ? "Loading models..." : error ? "Models unavailable" : "No models"}</option>
      ) : null}
      {models.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  );
}

export function PasswordField({
  value,
  visible,
  onToggle,
  onChange,
  onBlur,
}: {
  value: string;
  visible: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  return (
    <span className="pw-wrap">
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      <button className="pw-reveal" aria-label={visible ? "Hide key" : "Show key"} onClick={onToggle}>
        <EyeIcon />
      </button>
    </span>
  );
}

export function AzothMark() {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <circle cx="32" cy="20" r="6" stroke="currentColor" strokeWidth="3" />
      <path d="M14 52 L32 26 L50 52" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 42 L42 42" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
