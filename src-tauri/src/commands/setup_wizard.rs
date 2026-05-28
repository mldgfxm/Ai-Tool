use serde::Serialize;
use std::process::Command;

const VERIFICATION_CODE: &str = "8888";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyStatus {
    pub name: String,
    pub display_name: String,
    pub installed: bool,
    pub version: Option<String>,
    pub min_version: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupStatus {
    pub verified: bool,
    pub wizard_completed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyResult {
    pub success: bool,
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_setup_status() -> Result<SetupStatus, String> {
    let settings = crate::settings::get_settings();
    Ok(SetupStatus {
        verified: settings.setup_verified == Some(true),
        wizard_completed: settings.setup_wizard_completed == Some(true),
    })
}

#[tauri::command]
pub fn check_verification_status() -> Result<bool, String> {
    let settings = crate::settings::get_settings();
    Ok(settings.setup_verified == Some(true))
}

#[tauri::command]
pub fn verify_code(code: String) -> Result<VerifyResult, String> {
    if code == VERIFICATION_CODE {
        let mut settings = crate::settings::get_settings();
        settings.setup_verified = Some(true);
        crate::settings::update_settings(settings).map_err(|e| e.to_string())?;
        Ok(VerifyResult { success: true })
    } else {
        Ok(VerifyResult { success: false })
    }
}

#[tauri::command]
pub fn mark_setup_completed() -> Result<bool, String> {
    let mut settings = crate::settings::get_settings();
    settings.setup_wizard_completed = Some(true);
    crate::settings::update_settings(settings).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn reset_setup_wizard() -> Result<bool, String> {
    let mut settings = crate::settings::get_settings();
    settings.setup_wizard_completed = Some(false);
    crate::settings::update_settings(settings).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub async fn check_dependencies() -> Result<Vec<DependencyStatus>, String> {
    tokio::task::spawn_blocking(|| {
        let deps = vec![
            check_single_dep("node", "Node.js", Some("18")),
            check_single_dep("git", "Git", None),
            check_single_dep("claude", "Claude Code", None),
            check_single_dep("python", "Python", None),
        ];
        Ok(deps)
    })
    .await
    .map_err(|e| format!("check_dependencies task join error: {e}"))?
}

#[tauri::command]
pub async fn install_dependencies(names: Vec<String>) -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(move || {
        let mut installed = Vec::new();
        for name in &names {
            install_single_dep(name)?;
            installed.push(name.clone());
        }
        Ok(installed)
    })
    .await
    .map_err(|e| format!("install_dependencies task join error: {e}"))?
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

fn check_single_dep(name: &str, display_name: &str, min_version: Option<&str>) -> DependencyStatus {
    let version_cmd = match name {
        "python" => None, // special handling below
        _ => Some(name),
    };

    // Try primary command
    if let Some(cmd) = version_cmd {
        let result = run_version_check(cmd);
        return build_dep_status(name, display_name, result, min_version);
    }

    // Python: try python3 first, then python
    let result = run_version_check("python3");
    if let Some(ver) = &result {
        return DependencyStatus {
            name: name.to_string(),
            display_name: display_name.to_string(),
            installed: true,
            version: Some(ver.clone()),
            min_version: min_version.map(|s| s.to_string()),
            error: None,
        };
    }
    let result = run_version_check("python");
    build_dep_status(name, display_name, result, min_version)
}

fn build_dep_status(
    name: &str,
    display_name: &str,
    version: Option<String>,
    min_version: Option<&str>,
) -> DependencyStatus {
    let installed = version.is_some();
    DependencyStatus {
        name: name.to_string(),
        display_name: display_name.to_string(),
        installed,
        version,
        min_version: min_version.map(|s| s.to_string()),
        error: None,
    }
}

fn run_version_check(tool: &str) -> Option<String> {
    let output = run_cmd(&format!("{tool} --version"));
    match output {
        Ok(out) if out.status.success() => {
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            let raw = if stdout.is_empty() { stderr } else { stdout };
            if raw.is_empty() {
                None
            } else {
                Some(extract_semver(&raw))
            }
        }
        _ => None,
    }
}

fn extract_semver(input: &str) -> String {
    let re = regex::Regex::new(r"\d+\.\d+\.\d+(-[\w.]+)?").unwrap();
    if let Some(m) = re.find(input) {
        m.as_str().to_string()
    } else {
        // Fallback: try to find just major.minor
        let re2 = regex::Regex::new(r"\d+\.\d+").unwrap();
        re2.find(input)
            .map(|m| m.as_str().to_string())
            .unwrap_or_else(|| input.to_string())
    }
}

fn run_cmd(cmd: &str) -> std::io::Result<std::process::Output> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        Command::new("cmd")
            .arg("/C")
            .arg(cmd)
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output()
    }
    #[cfg(not(target_os = "windows"))]
    {
        let shell = std::env::var("SHELL")
            .ok()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "/bin/sh".to_string());
        Command::new(&shell)
            .arg("-lic")
            .arg(cmd)
            .output()
    }
}

fn run_cmd_blocking(cmd: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let output = Command::new("cmd")
            .arg("/C")
            .arg(cmd)
            .creation_flags(0x08000000)
            .output()
            .map_err(|e| format!("执行命令失败: {e}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("命令执行失败: {stderr}"));
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let output = Command::new("bash")
            .arg("-c")
            .arg(cmd)
            .output()
            .map_err(|e| format!("执行命令失败: {e}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("命令执行失败: {stderr}"));
        }
    }
    Ok(())
}

fn install_single_dep(name: &str) -> Result<(), String> {
    match name {
        "node" => install_node(),
        "git" => install_git(),
        "claude" => install_claude(),
        "python" => install_python(),
        _ => Err(format!("未知依赖: {name}")),
    }
}

#[cfg(target_os = "macos")]
fn install_node() -> Result<(), String> {
    // Try brew first
    if run_cmd("which brew").map(|o| o.status.success()).unwrap_or(false) {
        run_cmd_blocking("brew install node")?;
    } else {
        // Install brew first, then node
        run_cmd_blocking(r#"/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)""#)?;
        run_cmd_blocking("brew install node")?;
    }
    // Set npm registry to official source
    let _ = run_cmd_blocking("npm config set registry https://registry.npmjs.org/");
    Ok(())
}

#[cfg(target_os = "windows")]
fn install_node() -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    let temp_dir = std::env::temp_dir();
    let msi_path = temp_dir.join("node-setup.msi");

    // Download Node.js LTS installer
    let download_cmd = format!(
        "curl -L -o \"{}\" https://nodejs.org/dist/v22.16.0/node-v22.16.0-x64.msi",
        msi_path.display()
    );
    let output = Command::new("cmd")
        .arg("/C")
        .arg(&download_cmd)
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| format!("下载 Node.js 失败: {e}"))?;
    if !output.status.success() {
        return Err("下载 Node.js 安装包失败".to_string());
    }

    // Silent install
    let install_cmd = format!("msiexec /i \"{}\" /quiet /norestart", msi_path.display());
    let output = Command::new("cmd")
        .arg("/C")
        .arg(&install_cmd)
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| format!("安装 Node.js 失败: {e}"))?;
    let _ = std::fs::remove_file(&msi_path);

    if !output.status.success() {
        return Err("Node.js 安装失败".to_string());
    }
    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn install_node() -> Result<(), String> {
    run_cmd_blocking("curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -")?;
    run_cmd_blocking("sudo apt-get install -y nodejs")?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn install_git() -> Result<(), String> {
    if run_cmd("which brew").map(|o| o.status.success()).unwrap_or(false) {
        run_cmd_blocking("brew install git")
    } else {
        // Git is usually pre-installed on macOS, try xcode-select
        run_cmd_blocking("xcode-select --install").map_err(|_| {
            "请先安装 Homebrew 或 Xcode Command Line Tools".to_string()
        })
    }
}

#[cfg(target_os = "windows")]
fn install_git() -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    let temp_dir = std::env::temp_dir();
    let exe_path = temp_dir.join("git-setup.exe");

    let download_cmd = format!(
        "curl -L -o \"{}\" https://github.com/git-for-windows/git/releases/download/v2.49.0.windows.1/Git-2.49.0-64-bit.exe",
        exe_path.display()
    );
    let output = Command::new("cmd")
        .arg("/C")
        .arg(&download_cmd)
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| format!("下载 Git 失败: {e}"))?;
    if !output.status.success() {
        return Err("下载 Git 安装包失败".to_string());
    }

    let install_cmd = format!("\"{}\" /VERYSILENT /NORESTART", exe_path.display());
    let output = Command::new("cmd")
        .arg("/C")
        .arg(&install_cmd)
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| format!("安装 Git 失败: {e}"))?;
    let _ = std::fs::remove_file(&exe_path);

    if !output.status.success() {
        return Err("Git 安装失败".to_string());
    }
    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn install_git() -> Result<(), String> {
    run_cmd_blocking("sudo apt-get install -y git")
}

fn install_claude() -> Result<(), String> {
    // Ensure npm registry is set to official source
    let _ = run_cmd_blocking("npm config set registry https://registry.npmjs.org/");
    run_cmd_blocking("npm install -g @anthropic-ai/claude-code@latest")
}

#[cfg(target_os = "macos")]
fn install_python() -> Result<(), String> {
    if run_cmd("which brew").map(|o| o.status.success()).unwrap_or(false) {
        run_cmd_blocking("brew install python")
    } else {
        Err("请先安装 Homebrew，然后运行: brew install python".to_string())
    }
}

#[cfg(target_os = "windows")]
fn install_python() -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    let temp_dir = std::env::temp_dir();
    let exe_path = temp_dir.join("python-setup.exe");

    let download_cmd = format!(
        "curl -L -o \"{}\" https://www.python.org/ftp/python/3.13.7/python-3.13.7-amd64.exe",
        exe_path.display()
    );
    let output = Command::new("cmd")
        .arg("/C")
        .arg(&download_cmd)
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| format!("下载 Python 失败: {e}"))?;
    if !output.status.success() {
        return Err("下载 Python 安装包失败".to_string());
    }

    let install_cmd = format!(
        "\"{}\" /quiet InstallAllUsers=1 PrependPath=1",
        exe_path.display()
    );
    let output = Command::new("cmd")
        .arg("/C")
        .arg(&install_cmd)
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| format!("安装 Python 失败: {e}"))?;
    let _ = std::fs::remove_file(&exe_path);

    if !output.status.success() {
        return Err("Python 安装失败".to_string());
    }
    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn install_python() -> Result<(), String> {
    run_cmd_blocking("sudo apt-get install -y python3 python3-pip")
}
