import React from "react";
import { create } from "zustand";
import ConfirmDialog from "./ConfirmDialog";

// State management with zustand
interface ConfirmModalState {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  setModal: ({
    title,
    message,
    onConfirm,
    onCancel,
  }: {
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) => void;
}

export const useConfirmModal = create<ConfirmModalState>((set) => ({
  open: false,
  title: "",
  message: "",
  onConfirm: () => {},
  onCancel: () => {},
  setModal: ({
    title,
    message,
    onConfirm,
    onCancel,
  }: {
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) =>
    set({
      open: true,
      title,
      message,
      onConfirm,
      onCancel,
    }),
}));

function ConfirmModal() {
  const { open, title, message, onConfirm, onCancel } = useConfirmModal();

  const handleConfirm = () => {
    onConfirm();
    useConfirmModal.setState({ open: false });
  };

  const handleCancel = () => {
    onCancel();
    useConfirmModal.setState({ open: false });
  };

  return (
    <ConfirmDialog
      open={open}
      title={title}
      message={message}
      onClose={handleCancel}
      onConfirm={handleConfirm}
    />
  );
}

export default ConfirmModal;
