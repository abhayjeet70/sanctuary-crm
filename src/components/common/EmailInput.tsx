import { useState } from "react";
import { Input } from "@/components/ui/input";
import { emailProblem } from "@/lib/email";
import { cn } from "@/lib/utils";

/**
 * An email field that says what is wrong as soon as it can be known.
 *
 * The message appears once the person has left the field (or the form has
 * been submitted — `showError`), then follows every keystroke so it clears the
 * moment the address is fixed. It is marked `aria-invalid` and announced with
 * `role="alert"`, so it is not colour alone. Forms still call `emailProblem`
 * themselves before submitting: this component shows the problem, the form is
 * what refuses to proceed.
 */
export function EmailInput({
  id,
  value,
  onChange,
  required = true,
  showError = false,
  className,
  ...rest
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  /** Force the message on — set it when the person presses Continue/Save. */
  showError?: boolean;
} & Omit<React.ComponentProps<typeof Input>, "id" | "value" | "onChange" | "type" | "required">) {
  const [touched, setTouched] = useState(false);
  const problem = emailProblem(value, { required });
  const visible = (touched || showError) && problem;

  return (
    <>
      <Input
        {...rest}
        id={id}
        type="email"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          setTouched(true);
          rest.onBlur?.(e);
        }}
        aria-invalid={visible ? true : undefined}
        aria-describedby={visible ? `${id}-error` : rest["aria-describedby"]}
        className={cn(visible && "border-danger ring-danger/20", className)}
      />
      {visible && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs text-danger">
          {problem}
        </p>
      )}
    </>
  );
}
