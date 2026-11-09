import styles from "./CompanyDirectoryView.module.css";

type UndoAction = {
  id: number;
  message: string;
};

type Props = {
  action: UndoAction | null;
  onUndo: () => void;
};

export function CompanyDirectoryUndoToast({ action, onUndo }: Props) {
  if (!action) return null;

  return (
    <div
      key={action.id}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={styles.undoToast}
    >
      <span className="min-w-0 text-sm text-zinc-100">{action.message}</span>
      <button
        type="button"
        onClick={onUndo}
        className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-teal-300 hover:bg-zinc-800 hover:text-teal-200 focus-visible:outline-2 focus-visible:outline-teal-300"
      >
        Undo
      </button>
    </div>
  );
}
