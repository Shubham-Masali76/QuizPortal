export default function Toast({ message }) {
  if (!message) return null;

  return (
    <div className="toast">
      <span className="toast-icon">✓</span>
      <span>{message}</span>
    </div>
  );
}
