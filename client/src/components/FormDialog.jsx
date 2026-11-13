import { Button, Modal } from "./ui";

/** A dialog holding one form: its fields, the server's error if any, and Cancel / Save. */
export default function FormDialog({ title, submitLabel, saving, error, canSubmit = true, onSubmit, onClose, children }) {
  const formId = `form-${title.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button size="md" variant="primary" type="submit" form={formId} disabled={saving || !canSubmit}>
            {saving ? "Saving…" : submitLabel}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="space-y-3 px-4 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit && !saving) onSubmit();
        }}
      >
        {children}
        {error && (
          <p role="alert" className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
