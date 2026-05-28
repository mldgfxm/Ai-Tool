import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { setupApi, type DependencyStatus } from "@/lib/api";
import { toast } from "sonner";
import {
  CheckCircle2,
  Loader2,
  Package,
  PartyPopper,
} from "lucide-react";

interface SetupWizardProps {
  onComplete: () => void;
  reEntryMode?: boolean;
}

export function SetupWizard({ onComplete, reEntryMode }: SetupWizardProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [deps, setDeps] = useState<DependencyStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [installing, setInstalling] = useState(false);

  const loadDeps = useCallback(async () => {
    setLoading(true);
    try {
      const result = await setupApi.checkDependencies();
      setDeps(result);
      // Auto-select not-installed deps
      const notInstalled = new Set(
        result.filter((d) => !d.installed).map((d) => d.name)
      );
      setSelected(notInstalled);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDeps();
  }, [loadDeps]);

  const toggleSelect = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const toggleAll = () => {
    const notInstalled = deps.filter((d) => !d.installed);
    if (selected.size === notInstalled.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(notInstalled.map((d) => d.name)));
    }
  };

  const handleInstall = async () => {
    if (selected.size === 0) return;
    setInstalling(true);
    try {
      await setupApi.installDependencies(Array.from(selected));
      toast.success(t("setup.wizard.installed"));
      await loadDeps();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setInstalling(false);
    }
  };

  const handleFinish = async () => {
    if (reEntryMode) {
      onComplete();
      return;
    }
    try {
      await setupApi.markSetupCompleted();
      onComplete();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleSkipToEnd = async () => {
    if (reEntryMode) {
      onComplete();
      return;
    }
    await handleFinish();
  };

  const notInstalledCount = deps.filter((d) => !d.installed).length;

  // Step 0: Dependency Check & Install
  const renderDepsStep = () => (
    <div className="space-y-4">
      <div className="space-y-3">
        {deps.map((dep) => (
          <div
            key={dep.name}
            className="flex items-center gap-3 p-3 rounded-lg border border-border-default bg-card"
          >
            {!dep.installed ? (
              <Checkbox
                checked={selected.has(dep.name)}
                onCheckedChange={() => toggleSelect(dep.name)}
                disabled={installing}
              />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">
                  {dep.displayName}
                </span>
                {dep.installed ? (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                    {t("setup.wizard.installed")}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {t("setup.wizard.notInstalled")}
                  </span>
                )}
              </div>
              {dep.version && (
                <span className="text-xs text-muted-foreground">
                  {t("setup.wizard.version")}: {dep.version}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {notInstalledCount > 0 && (
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={toggleAll} disabled={installing}>
            {selected.size === notInstalledCount
              ? t("setup.wizard.deselectAll")
              : t("setup.wizard.selectAll")}
          </Button>
          <Button
            onClick={handleInstall}
            disabled={selected.size === 0 || installing}
          >
            {installing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("setup.wizard.installing")}
              </>
            ) : (
              <>
                <Package className="w-4 h-4" />
                {t("setup.wizard.installSelected")}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );

  // Step 1: Complete
  const renderCompleteStep = () => (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center space-y-4 py-8"
    >
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10">
        <PartyPopper className="w-8 h-8 text-emerald-500" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">
        {t("setup.wizard.successTitle")}
      </h2>
      <p className="text-sm text-muted-foreground text-center max-w-xs">
        {t("setup.wizard.successDescription")}
      </p>
    </motion.div>
  );

  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="w-full max-w-md mx-4 space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-xl font-semibold text-foreground">
            {t("setup.wizard.title")}
          </h1>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <span
              className={step === 0 ? "text-foreground font-medium" : ""}
            >
              {t("setup.wizard.stepDependencies")}
            </span>
            <span className="text-muted-foreground/50">&rarr;</span>
            <span
              className={step === 1 ? "text-foreground font-medium" : ""}
            >
              {t("setup.wizard.stepComplete")}
            </span>
          </div>
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">
                  {t("setup.wizard.checkDependencies")}
                </span>
              </div>
            ) : step === 0 ? (
              renderDepsStep()
            ) : (
              renderCompleteStep()
            )}
          </motion.div>
        </AnimatePresence>

        {/* Footer buttons */}
        {!loading && (
          <div className="flex items-center justify-between">
            {step === 0 ? (
              <>
                <Button
                  variant="ghost"
                  onClick={handleSkipToEnd}
                  disabled={installing}
                >
                  {t("setup.wizard.skip")}
                </Button>
                <Button
                  onClick={() => setStep(1)}
                  disabled={installing}
                >
                  {t("setup.wizard.next")}
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setStep(0)}>
                  {t("setup.wizard.back")}
                </Button>
                <Button onClick={handleFinish}>
                  {t("setup.wizard.finish")}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
