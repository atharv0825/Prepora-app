import { type FormEvent, startTransition } from "react";

/**
 * onSubmit for a form driven by useActionState. React resets a form after an `action={…}`
 * submission, which would wipe the admin's input when the server says no; submitting from
 * onSubmit inside a transition keeps the fields as they are.
 */
export function submitKeepingInput(action: (form: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => action(form));
  };
}
