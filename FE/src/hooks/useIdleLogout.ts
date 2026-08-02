import { useEffect, useRef } from "react";
import Swal from "sweetalert2";
import { useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/auth";

// Logout otomatis setelah 30 menit tanpa aktivitas
const IDLE_LIMIT = 30 * 60 * 1000;
const WARNING_TIME = 60 * 1000;

export function useIdleLogout() {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const isAuthed = useAuthStore((state) => state.isAuthed);

  const idleTimer = useRef<number | null>(null);
  const warningTimer = useRef<number | null>(null);
  const isWarningOpen = useRef(false);

  const clearTimers = () => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    if (warningTimer.current) window.clearTimeout(warningTimer.current);
  };

  const forceLogout = async () => {
    clearTimers();
    isWarningOpen.current = false;
    Swal.close();

    logout();

    await Swal.fire({
      icon: "info",
      title: "Sesi Berakhir",
      text: "Anda otomatis logout karena tidak ada aktivitas.",
      confirmButtonText: "Login Lagi",
      confirmButtonColor: "#0052A3",
      allowOutsideClick: false,
      allowEscapeKey: false,
    });

    navigate({ to: "/login" });
  };

  const showWarning = async () => {
    if (isWarningOpen.current) return;

    isWarningOpen.current = true;

    let timerInterval: number | undefined;

    const result = await Swal.fire({
      icon: "warning",
      title: "Sesi Hampir Berakhir",
      html: "Tidak ada aktivitas. Anda akan logout otomatis dalam <b>60</b> detik.",
      confirmButtonText: "Tetap Login",
      cancelButtonText: "Logout Sekarang",
      showCancelButton: true,
      confirmButtonColor: "#0052A3",
      cancelButtonColor: "#d33",
      allowOutsideClick: false,
      allowEscapeKey: false,
      timer: WARNING_TIME,
      timerProgressBar: true,
      didOpen: () => {
        const html = Swal.getHtmlContainer();
        timerInterval = window.setInterval(() => {
          const left = Swal.getTimerLeft();
          if (html && left) {
            const seconds = Math.ceil(left / 1000);
            html.innerHTML = `Tidak ada aktivitas. Anda akan logout otomatis dalam <b>${seconds}</b> detik.`;
          }
        }, 1000);
      },
      willClose: () => {
        if (timerInterval) window.clearInterval(timerInterval);
      },
    });

    isWarningOpen.current = false;

    if (result.isConfirmed) {
      resetTimer();
      return;
    }

    await forceLogout();
  };

  const resetTimer = () => {
    if (!isAuthed) return;

    clearTimers();

    idleTimer.current = window.setTimeout(() => {
      showWarning();
    }, IDLE_LIMIT);
  };

  useEffect(() => {
    if (!isAuthed) {
      clearTimers();
      return;
    }

    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];

    const handleActivity = () => {
      if (!isWarningOpen.current) {
        resetTimer();
      }
    };

    events.forEach((event) => {
      window.addEventListener(event, handleActivity);
    });

    resetTimer();

    return () => {
      clearTimers();
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [isAuthed]);
}
