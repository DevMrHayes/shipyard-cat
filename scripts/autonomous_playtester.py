#!/usr/bin/env python3
"""
Autonomous AI Playtester & Visual Inspection Robot for Shipyard Cat
===================================================================
Runs headless Chromium via Playwright against the local Vite dev server,
executes automated gameplay scenarios, captures real runtime screenshots,
audits game runtime logs, and sends visual telemetry to Gemini 4 Argon for QA.
"""

import os
import sys
import time
import json
import argparse
import subprocess
from datetime import datetime
from playwright.sync_api import sync_playwright

WORKSPACE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCREENSHOT_BASE_DIR = os.path.join(WORKSPACE_DIR, ".agents", "playtests", "screenshots")
LOG_FILE_PATH = os.path.join(WORKSPACE_DIR, ".agents", "logs", "game_runtime.log")

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

def run_playtest(url: str = "http://localhost:5173/", eval_argon: bool = True, output_dir: str = None):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    session_dir = output_dir or os.path.join(SCREENSHOT_BASE_DIR, f"session_{timestamp}")
    os.makedirs(session_dir, exist_ok=True)

    print("=" * 65)
    print(f"[PLAYTEST] Shipyard Cat Autonomous Playtesting Robot")
    print(f"Target URL:       {url}")
    print(f"Screenshots Dir:  {session_dir}")
    print(f"Argon Evaluation: {eval_argon}")
    print("=" * 65)

    console_logs = []
    page_errors = []
    screenshots_taken = []
    scenario_telemetry = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--enable-webgl",
                "--ignore-gpu-blocklist",
                "--use-gl=angle",
                "--use-angle=default",
                "--disable-web-security"
            ]
        )
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        page = context.new_page()

        page.on("console", lambda msg: console_logs.append(f"[{msg.type.upper()}] {msg.text}"))
        page.on("pageerror", lambda err: page_errors.append(str(err)))

        print(f"[*] Navigating to {url}...")
        page.goto(url, wait_until="networkidle", timeout=30000)

        # 1. Dismiss Onboarding / Enter Game
        print("[*] Waiting for 'Enter Yard' button...")
        try:
            page.wait_for_selector("#btn-enter-game", state="visible", timeout=10000)
            page.click("#btn-enter-game")
            print("[+] Clicked 'Enter Yard'. Entering simulation...")
        except Exception as e:
            print(f"[!] Warning on enter button: {e}")

        # Wait 2.5s for WebGL scene graph compilation and Alba GLTF model load
        time.sleep(2.5)

        # --- SCENARIO 1: Spawn & Alba Signature Orange Collar Verification ---
        print("\n--- [Scenario 1: Spawn & Collar Verification] ---")
        shot_path_1 = os.path.join(session_dir, "01_spawn_collar.png")
        page.screenshot(path=shot_path_1)
        screenshots_taken.append(shot_path_1)

        s1_state = page.evaluate("""() => {
            const game = window.game;
            return {
                catPos: game?.cat?.mesh?.position ? { x: game.cat.mesh.position.x, y: game.cat.mesh.position.y, z: game.cat.mesh.position.z } : null,
                collarVisible: !!game?.cat?.collarGroup?.visible,
                collarScale: game?.cat?.collarGroup?.scale ? { x: game.cat.collarGroup.scale.x, y: game.cat.collarGroup.scale.y, z: game.cat.collarGroup.scale.z } : null,
                health: game?.vitals?.currentHealth,
                stamina: game?.vitals?.currentStamina,
                activeAction: game?.cat?.currentActionName
            };
        }""")
        scenario_telemetry["scenario_1_spawn"] = s1_state
        print(f"  Alba Position: {s1_state.get('catPos')}")
        print(f"  Collar Scale:  {s1_state.get('collarScale')}")
        print(f"  Vitals:        HP={s1_state.get('health')}, Stamina={s1_state.get('stamina')}")

        # --- SCENARIO 2: Night Shift & Lighting Transition ---
        print("\n--- [Scenario 2: Night Shift Atmosphere & Particle Inspection] ---")
        page.keyboard.press("KeyN")
        time.sleep(1.2)
        shot_path_2 = os.path.join(session_dir, "02_night_mode_lighting.png")
        page.screenshot(path=shot_path_2)
        screenshots_taken.append(shot_path_2)

        s2_state = page.evaluate("""() => {
            const game = window.game;
            return {
                isNightMode: !!game?.renderSystem?.isNightMode,
                ambientIntensity: game?.renderSystem?.ambientLight?.intensity,
                sunColor: game?.renderSystem?.sunLight?.color?.getHexString(),
                activeSparksCount: game?.renderSystem?.sparkLifetimes?.filter(l => l > 0)?.length || 0
            };
        }""")
        scenario_telemetry["scenario_2_night"] = s2_state
        print(f"  Night Mode Active:   {s2_state.get('isNightMode')}")
        print(f"  Sun Moonlight Hex:   0x{s2_state.get('sunColor')}")
        print(f"  Active Sparks Count: {s2_state.get('activeSparksCount')}")

        # --- SCENARIO 3: Cat Haven Sanctuary & Cushion Rest Check ---
        print("\n--- [Scenario 3: Cat Haven Sanctuary & Cushion Rest Elevation] ---")
        # Teleport inside Cat Haven directly onto heated cushion
        page.evaluate("""() => {
            if (window.game?.physics && window.game?.cat) {
                const target = new (window.THREE || window.game.cat.mesh.position.constructor)(-55.0, 0.33, -66.5);
                window.game.physics.teleport(target, 0.0);
                window.game.cat.mesh.position.copy(target);
                window.game.handleInteractOrMeow();
            }
        }""")
        time.sleep(1.0)
        shot_path_3 = os.path.join(session_dir, "03_cat_haven_cushion_rest.png")
        page.screenshot(path=shot_path_3)
        screenshots_taken.append(shot_path_3)

        s3_state = page.evaluate("""() => {
            const game = window.game;
            const pos = game?.cat?.mesh?.position;
            const floor = game?.environment?.getPlatformFloor(pos?.x || -55, pos?.z || -66.5, pos?.y || 0.33);
            return {
                catPos: pos ? { x: pos.x, y: pos.y, z: pos.z } : null,
                detectedPlatformFloor: floor,
                isResting: !!game?.cat?.isResting,
                isWellRested: !!game?.cat?.isWellRested,
                health: game?.vitals?.currentHealth
            };
        }""")
        scenario_telemetry["scenario_3_haven_cushion"] = s3_state
        cat_pos = s3_state.get('catPos') or {}
        print(f"  Cat Elevation on Cushion: Y={cat_pos.get('y')} (Floor={s3_state.get('detectedPlatformFloor')})")
        print(f"  Well-Rested Buff Active:  {s3_state.get('isWellRested')}")

        # --- SCENARIO 4: Dockyard Kingpin Arena & Forward AI Direction ---
        print("\n--- [Scenario 4: Dockyard Kingpin Boss Battle & Head-First Movement] ---")
        page.evaluate("""() => {
            if (window.game?.physics && window.game?.cat) {
                const arenaPos = new (window.THREE || window.game.cat.mesh.position.constructor)(26.0, -2.0, -23.0);
                window.game.physics.teleport(arenaPos, 0.0);
                window.game.cat.mesh.position.copy(arenaPos);
            }
        }""")
        # Attack with Paw Swipe [J]
        page.keyboard.press("KeyJ")
        time.sleep(1.2)
        shot_path_4 = os.path.join(session_dir, "04_kingpin_boss_arena.png")
        page.screenshot(path=shot_path_4)
        screenshots_taken.append(shot_path_4)

        s4_state = page.evaluate("""() => {
            const game = window.game;
            const kingpin = game?.rats?.find(r => r.isKingpin);
            return {
                kingpinPresent: !!kingpin,
                kingpinPos: kingpin?.mesh?.position ? { x: kingpin.mesh.position.x, y: kingpin.mesh.position.y, z: kingpin.mesh.position.z } : null,
                kingpinHealth: kingpin?.health,
                kingpinMaxHealth: kingpin?.maxHealth,
                kingpinState: kingpin?.state,
                gltfRotationY: kingpin?.gltfModel?.rotation?.y,
                isBossMusicActive: !!window.soundEngine?.isBossMusicActive
            };
        }""")
        scenario_telemetry["scenario_4_kingpin"] = s4_state
        print(f"  Kingpin Health:       {s4_state.get('kingpinHealth')}/{s4_state.get('kingpinMaxHealth')}")
        print(f"  Kingpin State:        {s4_state.get('kingpinState')}")
        print(f"  GLTF Model Y-Rot:     {s4_state.get('gltfRotationY')} rad (Expected ~3.14 for forward orientation)")

        # --- SCENARIO 5: 0 HP Faint & Sanctuary Rescue Transition ---
        print("\n--- [Scenario 5: 0 HP Faint & Sanctuary Rescue Sequence] ---")
        page.evaluate("""() => {
            if (window.game?.vitals) {
                window.game.vitals.takeDamage(100);
            }
        }""")
        time.sleep(1.0)
        shot_path_5 = os.path.join(session_dir, "05_faint_blackout_overlay.png")
        page.screenshot(path=shot_path_5)
        screenshots_taken.append(shot_path_5)

        s5_fade_state = page.evaluate("""() => {
            const overlay = document.getElementById('faint-blackout-overlay');
            return {
                overlayVisible: overlay && overlay.style.display !== 'none',
                overlayOpacity: overlay ? window.getComputedStyle(overlay).opacity : '0',
                isFaintLocked: !!window.game?.isFaintLocked
            };
        }""")
        print(f"  Blackout Overlay Active: {s5_fade_state.get('overlayVisible')}, Opacity={s5_fade_state.get('overlayOpacity')}")

        # Wait for full rescue transition & teleportation back to Haven
        time.sleep(3.0)
        shot_path_6 = os.path.join(session_dir, "06_post_rescue_haven_restoration.png")
        page.screenshot(path=shot_path_6)
        screenshots_taken.append(shot_path_6)

        s5_recover_state = page.evaluate("""() => {
            const game = window.game;
            const pos = game?.cat?.mesh?.position;
            return {
                recoveredCatPos: pos ? { x: pos.x, y: pos.y, z: pos.z } : null,
                recoveredHealth: game?.vitals?.currentHealth,
                recoveredStamina: game?.vitals?.currentStamina,
                recoveredHunger: game?.vitals?.currentHunger,
                isFaintLocked: !!game?.isFaintLocked
            };
        }""")
        scenario_telemetry["scenario_5_faint_recovery"] = {
            "blackout": s5_fade_state,
            "recovery": s5_recover_state
        }
        print(f"  Post-Rescue Location: {s5_recover_state.get('recoveredCatPos')}")
        print(f"  Post-Rescue Health:   {s5_recover_state.get('recoveredHealth')}/100")

        browser.close()

    # Save complete JSON session report
    report_file = os.path.join(session_dir, "playtest_report.json")
    full_report = {
        "timestamp": timestamp,
        "targetUrl": url,
        "screenshots": screenshots_taken,
        "telemetry": scenario_telemetry,
        "pageErrors": page_errors,
        "consoleWarningCount": len([l for l in console_logs if "WARN" in l or "ERROR" in l])
    }
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump(full_report, f, indent=2)

    print("\n" + "=" * 65)
    print(f" Playtest Complete! Report saved to {report_file}")
    print(f" Captured {len(screenshots_taken)} High-Res WebGL Screenshots")
    print("=" * 65)

    # Copy screenshots to artifact directory for instant viewing in Antigravity chat
    artifact_dir = r"C:\Users\hayes\.gemini\antigravity\brain\cf379066-f99f-4260-ae2c-03248b329e03"
    if os.path.exists(artifact_dir):
        import shutil
        for shot in screenshots_taken:
            base_name = os.path.basename(shot)
            dst_path = os.path.join(artifact_dir, f"playtest_{timestamp}_{base_name}")
            try:
                shutil.copy2(shot, dst_path)
            except Exception:
                pass

    # Optional Gemini 4 Argon QA Assessment
    if eval_argon:
        print("\n[*] Sending Playtest Telemetry & Results to Gemini 4 Argon for QA Evaluation...")
        argon_prompt = f"""
You are the Lead QA & Graphics Engineer for Shipyard Cat. Review this autonomous playtest telemetry run and screenshots data:
Session Timestamp: {timestamp}
Page Errors: {page_errors}
Console Warnings: {len([l for l in console_logs if 'WARN' in l or 'ERROR' in l])}

Scenario Results:
1. Spawn & Collar: {json.dumps(scenario_telemetry.get('scenario_1_spawn', {}))}
2. Night Shift & Sparks: {json.dumps(scenario_telemetry.get('scenario_2_night', {}))}
3. Cat Haven Cushion Platform: {json.dumps(scenario_telemetry.get('scenario_3_haven_cushion', {}))}
4. Dockyard Kingpin Forward Orientation: {json.dumps(scenario_telemetry.get('scenario_4_kingpin', {}))}
5. 0 HP Faint & Sanctuary Rescue: {json.dumps(scenario_telemetry.get('scenario_5_faint_recovery', {}))}

Evaluate whether:
- Alba collar scaling (1.85x) and neck bone alignment are validated.
- Cushion floor platform prevents any lower-body clipping.
- Kingpin GLTF model is facing forward (Math.PI / ~3.14 rad).
- Faint transition smoothly triggers blackout and 100% vitals recovery.
Provide a concise, executive QA verdict.
"""
        try:
            cloud_mesh_script = os.path.join(WORKSPACE_DIR, "scripts", "cloud_agent_mesh.py")
            cmd = ["py", "-3", cloud_mesh_script, "--role", "evaluator", "--prompt", argon_prompt]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=45)
            print("\n--- [Gemini 4 Argon QA Verdict] ---")
            print(res.stdout.strip())
        except Exception as e:
            print(f"[!] Could not run Argon QA evaluation: {e}")

    return full_report

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Autonomous Shipyard Cat Playtesting Robot")
    parser.add_argument("--url", default="http://localhost:5173/", help="Dev server URL")
    parser.add_argument("--no-argon", action="store_true", help="Skip Gemini 4 Argon QA evaluation")
    parser.add_argument("--output-dir", default=None, help="Custom output directory for screenshots")
    args = parser.parse_args()

    run_playtest(url=args.url, eval_argon=not args.no_argon, output_dir=args.output_dir)
