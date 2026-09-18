import { useCallback, useRef, useState } from "react";

type ToastTipo = "success" | "error" | "info";
interface ToastItem {
  id: number;
  tipo: ToastTipo;
  mensaje: string;
}

const ESTILO: Record<ToastTipo, string> = {
  success: "bg-green-600 text-white",
  error: "bg-red-600 text-white",
  info: "bg-gray-800 text-white",
};
const ICONO: Record<ToastTipo, string> = {
  success: "✓",
  error: "⚠",
  info: "ℹ",
};

/**
 * Reemplazo de window.alert() con notificaciones no bloqueantes (toasts) del
 * diseño del sistema. Auto-desaparecen a los ~4s.
 * Uso:
 *   const { toast, ToastUI } = useToast();
 *   toast.success("Guardado"); toast.error("Falló");
 *   return (<>{ToastUI}...</>)
 */
export function useToast() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const push = useCallback((tipo: ToastTipo, mensaje: string) => {
    const id = nextId.current++;
    setItems((prev) => [...prev, { id, tipo, mensaje }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const toast = {
    success: (m: string) => push("success", m),
    error: (m: string) => push("error", m),
    info: (m: string) => push("info", m),
  };

  const ToastUI = (
    <div className="fixed top-4 right-4 z-[70] flex flex-col gap-2 max-w-sm">
      {items.map((t) => (
        <div
          key={t.id}
          className={`${ESTILO[t.tipo]} rounded-lg shadow-lg px-4 py-3 text-sm flex items-start gap-2 animate-[fadeIn_0.15s_ease-out]`}
        >
          <span className="shrink-0">{ICONO[t.tipo]}</span>
          <span className="whitespace-pre-line">{t.mensaje}</span>
        </div>
      ))}
    </div>
  );

  return { toast, ToastUI };
}
