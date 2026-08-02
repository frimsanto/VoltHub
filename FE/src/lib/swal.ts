import Swal from "sweetalert2";

export const showSuccess = (title: string, text?: string) => {
  return Swal.fire({
    icon: "success",
    title,
    text,
    confirmButtonText: "OK",
    confirmButtonColor: "#0052A3",
  });
};

export const showError = (title: string, text?: string) => {
  return Swal.fire({
    icon: "error",
    title,
    text,
    confirmButtonText: "Tutup",
    confirmButtonColor: "#d33",
  });
};

export const showWarning = (title: string, text?: string) => {
  return Swal.fire({
    icon: "warning",
    title,
    text,
    confirmButtonText: "OK",
    confirmButtonColor: "#FACC15",
  });
};

export const showInfo = (title: string, text?: string) => {
  return Swal.fire({
    icon: "info",
    title,
    text,
    confirmButtonText: "OK",
    confirmButtonColor: "#0052A3",
  });
};

export const showSuccessAuto = (title: string, text?: string, timer = 1400) => {
  return Swal.fire({
    icon: "success",
    title,
    text,
    timer,
    timerProgressBar: true,
    showConfirmButton: false,
    confirmButtonColor: "#0052A3",
  });
};

export const showInfoAuto = (title: string, text?: string, timer = 1400) => {
  return Swal.fire({
    icon: "info",
    title,
    text,
    timer,
    timerProgressBar: true,
    showConfirmButton: false,
    confirmButtonColor: "#0052A3",
  });
};

export const showConfirm = (
  title: string,
  text?: string,
  confirmButtonText = "Ya",
  cancelButtonText = "Batal",
) => {
  return Swal.fire({
    icon: "question",
    title,
    text,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText,
    confirmButtonColor: "#0052A3",
    cancelButtonColor: "#6B7280",
    reverseButtons: true,
  });
};

export const showLoading = (title = "Memproses...", text?: string) => {
  Swal.fire({
    title,
    text,
    allowOutsideClick: false,
    allowEscapeKey: false,
    didOpen: () => {
      Swal.showLoading();
    },
  });
};

export const closeSwal = () => {
  Swal.close();
};
