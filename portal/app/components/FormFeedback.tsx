/**
 * Accessible action feedback. The live region is always rendered so screen
 * readers announce messages that arrive after an action completes.
 */
export function FormFeedback({
  error,
  success,
}: {
  error?: string | null;
  success?: string | null;
}) {
  const message = error || success || '';
  return (
    <p
      role="status"
      aria-live="polite"
      className={`feedback${error ? ' error' : success ? ' success' : ''}`}
    >
      {message}
    </p>
  );
}
