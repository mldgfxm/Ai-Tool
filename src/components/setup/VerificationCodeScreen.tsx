import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setupApi } from "@/lib/api";
import { ShieldCheck } from "lucide-react";

export function VerificationCodeScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    if (code.length === 0 || loading) return;
    setLoading(true);
    setError(false);
    try {
      const result = await setupApi.verifyCode(code);
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["settings"] });
      } else {
        setError(true);
        setCode("");
        inputRef.current?.focus();
      }
    } catch {
      setError(true);
      setCode("");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit();
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="w-full max-w-sm mx-4 space-y-6">
        <div className="flex flex-col items-center space-y-2">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 dark:bg-blue-400/10">
            <ShieldCheck className="w-8 h-8 text-blue-500 dark:text-blue-400" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">
            {t("setup.verification.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("setup.verification.description")}
          </p>
        </div>

        <div className="space-y-3">
          <Input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            maxLength={10}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setError(false);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t("setup.verification.placeholder")}
            className="text-center text-lg tracking-widest h-12"
            disabled={loading}
          />

          {error && (
            <p className="text-sm text-red-500 text-center">
              {t("setup.verification.error")}
            </p>
          )}

          <Button
            onClick={handleSubmit}
            disabled={code.length === 0 || loading}
            className="w-full h-10"
          >
            {loading ? "..." : t("setup.verification.submit")}
          </Button>
        </div>
      </div>
    </div>
  );
}
