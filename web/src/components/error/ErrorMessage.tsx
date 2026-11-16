interface Props {
  message: string | null;
  id?: string;
  className?: string;
}

// Shows nothing until there's a message. Pages place it with className, and
// give it an id when a field's aria-describedby points to it.
export default function ErrorMessage({ message, id, className = "" }: Props) {
  if (!message) {
    return null;
  }
  return (
    <p id={id} role="alert" className={`text-red-700 dark:text-red-400 ${className}`.trim()}>
      {message}
    </p>
  );
}
