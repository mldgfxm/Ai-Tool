import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsQuery } from "@/lib/query/queries";
import { VerificationCodeScreen } from "./VerificationCodeScreen";
import { SetupWizard } from "./SetupWizard";

interface SetupGateProps {
  children: React.ReactNode;
}

export function SetupGate({ children }: SetupGateProps) {
  const { data: settings, isLoading } = useSettingsQuery();
  const queryClient = useQueryClient();
  const [showWizard, setShowWizard] = useState(false);

  if (isLoading || !settings) {
    return null;
  }

  const verified = settings.setupVerified === true;
  const completed = settings.setupWizardCompleted === true;

  // Wizard completed and not re-entered → show main app
  if (completed && !showWizard) {
    return <>{children}</>;
  }

  // Not verified → show verification screen
  if (!verified) {
    return <VerificationCodeScreen />;
  }

  // Verified but not completed (or re-entered) → show wizard
  const handleComplete = async () => {
    if (showWizard) {
      // Re-entry mode: just go back to main app
      setShowWizard(false);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    } else {
      // First-time: mark completed and relaunch
      try {
        await invoke("mark_setup_completed");
        await invoke("relaunch");
      } catch (e) {
        console.error("Failed to complete setup:", e);
      }
    }
  };

  return <SetupWizard onComplete={handleComplete} reEntryMode={showWizard} />;
}

/**
 * Call this to re-enter the setup wizard from the main app (e.g., settings page).
 */
export function useReEnterWizard() {
  const queryClient = useQueryClient();

  return async () => {
    try {
      await invoke("reset_setup_wizard");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    } catch (e) {
      console.error("Failed to reset setup wizard:", e);
    }
  };
}
