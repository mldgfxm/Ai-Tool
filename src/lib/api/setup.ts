import { invoke } from "@tauri-apps/api/core";

export interface DependencyStatus {
  name: string;
  displayName: string;
  installed: boolean;
  version: string | null;
  minVersion: string | null;
  error: string | null;
}

export interface SetupStatus {
  verified: boolean;
  wizardCompleted: boolean;
}

export interface VerifyResult {
  success: boolean;
}

export const setupApi = {
  async getSetupStatus(): Promise<SetupStatus> {
    return await invoke("get_setup_status");
  },

  async checkVerificationStatus(): Promise<boolean> {
    return await invoke("check_verification_status");
  },

  async verifyCode(code: string): Promise<VerifyResult> {
    return await invoke("verify_code", { code });
  },

  async checkDependencies(): Promise<DependencyStatus[]> {
    return await invoke("check_dependencies");
  },

  async installDependencies(names: string[]): Promise<string[]> {
    return await invoke("install_dependencies", { names });
  },

  async markSetupCompleted(): Promise<boolean> {
    return await invoke("mark_setup_completed");
  },

  async resetSetupWizard(): Promise<boolean> {
    return await invoke("reset_setup_wizard");
  },
};
