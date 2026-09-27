import type { InputHTMLAttributes } from 'react';

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; id: string };

/** Label + input with the app's standard styling. Extra props go straight to <input>. */
export default function TextField({ label, id, className = '', ...inputProps }: TextFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input id={id} className={`field ${className}`} {...inputProps} />
    </div>
  );
}
