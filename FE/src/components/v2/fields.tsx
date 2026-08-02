// VoltHub V2 — form field primitives (react-hook-form + shadcn).
// Controlled wrappers used by all master-data forms (DESIGN_SYSTEM §4). Each binds
// to a RHF `control` + `name`, renders label/error, and marks required fields.
import { Controller, type Control, type FieldValues, type Path } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface BaseProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

function FieldShell({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  required,
  placeholder,
  disabled,
}: BaseProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell label={label} required={required} error={fieldState.error?.message}>
          <Input
            {...field}
            value={field.value ?? ""}
            placeholder={placeholder}
            disabled={disabled}
            aria-invalid={!!fieldState.error}
          />
        </FieldShell>
      )}
    />
  );
}

export function NumberField<T extends FieldValues>({
  control,
  name,
  label,
  required,
  placeholder,
  disabled,
}: BaseProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell label={label} required={required} error={fieldState.error?.message}>
          <Input
            type="number"
            value={field.value ?? ""}
            onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
            onBlur={field.onBlur}
            name={field.name}
            ref={field.ref}
            placeholder={placeholder}
            disabled={disabled}
            aria-invalid={!!fieldState.error}
          />
        </FieldShell>
      )}
    />
  );
}

export function TextareaField<T extends FieldValues>({
  control,
  name,
  label,
  required,
  placeholder,
  disabled,
}: BaseProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell label={label} required={required} error={fieldState.error?.message}>
          <Textarea
            {...field}
            value={field.value ?? ""}
            placeholder={placeholder}
            disabled={disabled}
            rows={3}
            aria-invalid={!!fieldState.error}
          />
        </FieldShell>
      )}
    />
  );
}

export function DateField<T extends FieldValues>({
  control,
  name,
  label,
  required,
  disabled,
}: BaseProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell label={label} required={required} error={fieldState.error?.message}>
          <Input
            type="date"
            {...field}
            value={field.value ?? ""}
            disabled={disabled}
            aria-invalid={!!fieldState.error}
          />
        </FieldShell>
      )}
    />
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  required,
  placeholder = "Pilih…",
  disabled,
  options,
}: BaseProps<T> & { options: SelectOption[] }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell label={label} required={required} error={fieldState.error?.message}>
          <Select
            value={field.value ?? undefined}
            onValueChange={field.onChange}
            disabled={disabled}
          >
            <SelectTrigger aria-invalid={!!fieldState.error} className="w-full">
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldShell>
      )}
    />
  );
}

/**
 * Multi-select via checkbox group. Binds to a string[] field (RHF). Used for
 * "Laporan yang harus diisi" pada form Buat WO (requiredReports).
 */
export function CheckboxGroupField<T extends FieldValues>({
  control,
  name,
  label,
  required,
  description,
  options,
}: BaseProps<T> & {
  description?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const current: string[] = Array.isArray(field.value) ? field.value : [];
        const toggle = (value: string, checked: boolean) => {
          const next = checked
            ? Array.from(new Set([...current, value]))
            : current.filter((v) => v !== value);
          field.onChange(next);
        };
        return (
          <FieldShell label={label} required={required} error={fieldState.error?.message}>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {options.map((opt) => {
                const checked = current.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 text-sm hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(c) => toggle(opt.value, c === true)}
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
          </FieldShell>
        );
      }}
    />
  );
}

export function SwitchField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  disabled,
}: BaseProps<T> & { description?: string }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <Label className="text-sm">{label}</Label>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          <Switch checked={!!field.value} onCheckedChange={field.onChange} disabled={disabled} />
        </div>
      )}
    />
  );
}
