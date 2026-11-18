using System;
using System.Threading.Tasks;
using ShipyardCat.Player;
using Unity.Services.Authentication;
using Unity.Services.Core;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UIElements;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace ShipyardCat.Core
{
    public enum GameState
    {
        TitleLogin,
        Playing,
        Paused,
        Ended
    }

    public sealed class GameShellController : MonoBehaviour
    {
        private const string PrefCallsignKey = "ShipyardCat_Callsign";
        private const string PrefMusicVolumeKey = "ShipyardCat_MusicVolume";
        private const string PrefSfxVolumeKey = "ShipyardCat_SfxVolume";
        private const string DefaultCallsign = "ALBA-01";

        public static GameShellController Instance { get; private set; }

        [Header("UI & Scene References")]
        [SerializeField] private UIDocument uiDocument;
        [SerializeField] private Transform orbitPivot;
        [SerializeField] private Camera mainCamera;

        [Header("Title Camera Orbit")]
        [SerializeField] private float orbitRadius = 5.5f;
        [SerializeField] private float orbitHeight = 1.9f;
        [SerializeField] private float orbitSpeedDeg = 10f;

        private AlbaController _albaController;
        private Behaviour _cameraRig;

        private VisualElement _titleLoginOverlay;
        private TextField _callsignInput;
        private Button _btnBeginShift;
        private Label _authStatusLabel;

        private VisualElement _pauseOverlay;
        private Button _btnResume;
        private Button _btnPauseRestart;
        private Button _btnQuitTitle;
        private Slider _musicSlider;
        private Slider _sfxSlider;

        private float _orbitAngleDeg;
        private bool _uiBound;

        public GameState CurrentState { get; private set; } = GameState.TitleLogin;
        public string ActiveCallsign { get; private set; } = DefaultCallsign;
        public float MusicVolume { get; private set; } = 0.75f;
        public float SfxVolume { get; private set; } = 0.85f;

        public event Action<GameState> OnStateChanged;
        public event Action<float> OnMusicVolumeChanged;
        public event Action<float> OnSfxVolumeChanged;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;

            ActiveCallsign = PlayerPrefs.GetString(PrefCallsignKey, DefaultCallsign);
            if (string.IsNullOrWhiteSpace(ActiveCallsign))
            {
                ActiveCallsign = DefaultCallsign;
            }

            MusicVolume = PlayerPrefs.GetFloat(PrefMusicVolumeKey, 0.75f);
            SfxVolume = PlayerPrefs.GetFloat(PrefSfxVolumeKey, 0.85f);

            ResolveSceneReferences();
        }

        private async void Start()
        {
            ResolveSceneReferences();
            BindUI();
            ApplyState(GameState.TitleLogin);
            await InitializeServicesSafeAsync();
        }

        private void Update()
        {
            if (CurrentState == GameState.TitleLogin)
            {
                UpdateTitleOrbit();
                var kb = UnityEngine.InputSystem.Keyboard.current;
                if (kb != null && (kb.enterKey.wasPressedThisFrame || kb.numpadEnterKey.wasPressedThisFrame))
                {
                    BeginShift();
                    return;
                }
            }

            if (WasPausePressedThisFrame())
            {
                if (CurrentState == GameState.Playing)
                {
                    SetPaused(true);
                }
                else if (CurrentState == GameState.Paused)
                {
                    SetPaused(false);
                }
            }
        }

        private void OnDestroy()
        {
            UnbindUI();

            if (Instance == this)
            {
                Instance = null;
            }

            if (Time.timeScale == 0f)
            {
                Time.timeScale = 1f;
            }
        }

        public void Configure(UIDocument document, Transform pivot, Camera cam)
        {
            if (document != null) uiDocument = document;
            if (pivot != null) orbitPivot = pivot;
            if (cam != null) mainCamera = cam;

            ResolveSceneReferences();
            UnbindUI();
            BindUI();
            RefreshOverlays();
        }

        public void BeginShift()
        {
            if (_callsignInput != null)
            {
                string entered = _callsignInput.value?.Trim();
                ActiveCallsign = string.IsNullOrWhiteSpace(entered) ? DefaultCallsign : entered.ToUpperInvariant();
                _callsignInput.SetValueWithoutNotify(ActiveCallsign);
                PlayerPrefs.SetString(PrefCallsignKey, ActiveCallsign);
                PlayerPrefs.Save();
            }

            ApplyState(GameState.Playing);
        }

        public void SetPaused(bool paused)
        {
            if (CurrentState != GameState.Playing && CurrentState != GameState.Paused)
            {
                return;
            }

            ApplyState(paused ? GameState.Paused : GameState.Playing);
        }

        public void ReturnToTitle()
        {
            ApplyState(GameState.TitleLogin);
        }

        public void SetEnded()
        {
            ApplyState(GameState.Ended);
        }

        private void ApplyState(GameState nextState)
        {
            CurrentState = nextState;
            Time.timeScale = nextState == GameState.Paused ? 0f : 1f;

            bool gameplayActive = nextState == GameState.Playing;
            ResolveSceneReferences();

            if (_albaController != null)
            {
                _albaController.enabled = gameplayActive;
            }

            if (_cameraRig != null)
            {
                _cameraRig.enabled = gameplayActive;
            }

            var hudController = FindAnyObjectByType<ShipyardCat.UI.ShipyardHUDController>();
            if (hudController != null)
            {
                hudController.SetGameplayHudVisible(gameplayActive);
            }

            if (!gameplayActive)
            {
                UnityEngine.Cursor.lockState = CursorLockMode.None;
                UnityEngine.Cursor.visible = true;
            }

            RefreshOverlays();
            OnStateChanged?.Invoke(CurrentState);
        }

        private void RefreshOverlays()
        {
            if (uiDocument != null && uiDocument.rootVisualElement != null)
            {
                bool showHud = CurrentState != GameState.TitleLogin;
                var topBar = uiDocument.rootVisualElement.Q<VisualElement>("top-bar");
                if (topBar != null) topBar.style.display = showHud ? DisplayStyle.Flex : DisplayStyle.None;
                var missionCard = uiDocument.rootVisualElement.Q<VisualElement>("mission-card");
                if (missionCard != null) missionCard.style.display = showHud ? DisplayStyle.Flex : DisplayStyle.None;
            }

            if (_titleLoginOverlay != null)
            {
                _titleLoginOverlay.style.display = CurrentState == GameState.TitleLogin
                    ? DisplayStyle.Flex
                    : DisplayStyle.None;
            }

            if (_pauseOverlay != null)
            {
                _pauseOverlay.style.display = CurrentState == GameState.Paused
                    ? DisplayStyle.Flex
                    : DisplayStyle.None;
            }
        }

        private void ResolveSceneReferences()
        {
            if (uiDocument == null)
            {
                uiDocument = FindFirstObjectByType<UIDocument>();
            }

            if (mainCamera == null)
            {
                mainCamera = Camera.main;
            }

            if (_albaController == null)
            {
                _albaController = FindFirstObjectByType<AlbaController>();
            }

            if (orbitPivot == null && _albaController != null)
            {
                orbitPivot = _albaController.transform;
            }

            if (_cameraRig == null && mainCamera != null)
            {
                _cameraRig = mainCamera.GetComponent("AlbaCameraRig") as Behaviour;
                if (_cameraRig == null && mainCamera.transform.parent != null)
                {
                    _cameraRig = mainCamera.transform.parent.GetComponent("AlbaCameraRig") as Behaviour;
                }
            }
        }

        private void BindUI()
        {
            if (_uiBound || uiDocument == null)
            {
                return;
            }

            VisualElement root = uiDocument.rootVisualElement;
            if (root == null)
            {
                return;
            }

            _titleLoginOverlay = root.Q<VisualElement>("title-login-overlay");
            _callsignInput = root.Q<TextField>("callsign-input");
            _btnBeginShift = root.Q<Button>("btn-begin-shift");
            _authStatusLabel = root.Q<Label>("auth-status-label");

            _pauseOverlay = root.Q<VisualElement>("pause-overlay");
            _btnResume = root.Q<Button>("btn-resume");
            _btnPauseRestart = root.Q<Button>("btn-pause-restart");
            _btnQuitTitle = root.Q<Button>("btn-quit-title");
            _musicSlider = root.Q<Slider>("music-slider");
            _sfxSlider = root.Q<Slider>("sfx-slider");

            if (_callsignInput != null)
            {
                _callsignInput.SetValueWithoutNotify(ActiveCallsign);
            }

            if (_btnBeginShift != null)
            {
                _btnBeginShift.clicked += HandleBeginShiftClicked;
            }

            if (_btnResume != null)
            {
                _btnResume.clicked += HandleResumeClicked;
            }

            if (_btnPauseRestart != null)
            {
                _btnPauseRestart.clicked += HandleRestartClicked;
            }

            if (_btnQuitTitle != null)
            {
                _btnQuitTitle.clicked += HandleQuitTitleClicked;
            }

            if (_musicSlider != null)
            {
                _musicSlider.SetValueWithoutNotify(MusicVolume);
                _musicSlider.RegisterValueChangedCallback(HandleMusicSliderChanged);
            }

            if (_sfxSlider != null)
            {
                _sfxSlider.SetValueWithoutNotify(SfxVolume);
                _sfxSlider.RegisterValueChangedCallback(HandleSfxSliderChanged);
            }

            _uiBound = true;
            RefreshOverlays();
        }

        private void UnbindUI()
        {
            if (!_uiBound)
            {
                return;
            }

            if (_btnBeginShift != null) _btnBeginShift.clicked -= HandleBeginShiftClicked;
            if (_btnResume != null) _btnResume.clicked -= HandleResumeClicked;
            if (_btnPauseRestart != null) _btnPauseRestart.clicked -= HandleRestartClicked;
            if (_btnQuitTitle != null) _btnQuitTitle.clicked -= HandleQuitTitleClicked;
            if (_musicSlider != null) _musicSlider.UnregisterValueChangedCallback(HandleMusicSliderChanged);
            if (_sfxSlider != null) _sfxSlider.UnregisterValueChangedCallback(HandleSfxSliderChanged);

            _uiBound = false;
        }

        private void UpdateTitleOrbit()
        {
            if (mainCamera == null)
            {
                return;
            }

            Vector3 pivotPos = orbitPivot != null ? orbitPivot.position : Vector3.zero;
            _orbitAngleDeg = (_orbitAngleDeg + orbitSpeedDeg * Time.unscaledDeltaTime) % 360f;
            float rad = _orbitAngleDeg * Mathf.Deg2Rad;

            Vector3 offset = new Vector3(
                Mathf.Cos(rad) * orbitRadius,
                orbitHeight,
                Mathf.Sin(rad) * orbitRadius
            );

            mainCamera.transform.position = pivotPos + offset;
            mainCamera.transform.LookAt(pivotPos + Vector3.up * 1.5f);
        }

        private async Task InitializeServicesSafeAsync()
        {
            SetAuthStatus($"LINKING UGS TELEMETRY... [{ActiveCallsign}]");

            try
            {
                if (UnityServices.State == ServicesInitializationState.Uninitialized)
                {
                    await UnityServices.InitializeAsync();
                }

                if (this == null) return;

                if (!AuthenticationService.Instance.IsSignedIn)
                {
                    await AuthenticationService.Instance.SignInAnonymouslyAsync();
                }

                if (this == null) return;

                string playerId = AuthenticationService.Instance.PlayerId;
                string shortId = !string.IsNullOrEmpty(playerId) && playerId.Length > 8
                    ? playerId.Substring(0, 8)
                    : (playerId ?? "ANON");

                SetAuthStatus($"UGS LINKED // OPERATOR: {ActiveCallsign} ({shortId})");
            }
            catch (Exception ex)
            {
                if (this == null) return;

                Debug.LogWarning($"[GameShellController] UGS auth unavailable, continuing offline: {ex.Message}");
                SetAuthStatus($"OFFLINE SHIFT MODE // CALLSIGN: {ActiveCallsign}");
            }
        }

        private void SetAuthStatus(string message)
        {
            if (_authStatusLabel != null)
            {
                _authStatusLabel.text = message;
            }
        }

        private void HandleBeginShiftClicked() => BeginShift();
        private void HandleResumeClicked() => SetPaused(false);

        private void HandleRestartClicked()
        {
            Time.timeScale = 1f;
            Scene activeScene = SceneManager.GetActiveScene();
            SceneManager.LoadScene(activeScene.buildIndex);
        }

        private void HandleQuitTitleClicked() => ReturnToTitle();

        private void HandleMusicSliderChanged(ChangeEvent<float> evt)
        {
            MusicVolume = Mathf.Clamp01(evt.newValue);
            PlayerPrefs.SetFloat(PrefMusicVolumeKey, MusicVolume);
            OnMusicVolumeChanged?.Invoke(MusicVolume);
        }

        private void HandleSfxSliderChanged(ChangeEvent<float> evt)
        {
            SfxVolume = Mathf.Clamp01(evt.newValue);
            PlayerPrefs.SetFloat(PrefSfxVolumeKey, SfxVolume);
            OnSfxVolumeChanged?.Invoke(SfxVolume);
        }

        private static bool WasPausePressedThisFrame()
        {
#if ENABLE_INPUT_SYSTEM
            Keyboard keyboard = Keyboard.current;
            if (keyboard != null && (keyboard.escapeKey.wasPressedThisFrame || keyboard.pKey.wasPressedThisFrame))
            {
                return true;
            }
#endif
#if ENABLE_LEGACY_INPUT_MANAGER
            if (Input.GetKeyDown(KeyCode.Escape) || Input.GetKeyDown(KeyCode.P))
            {
                return true;
            }
#endif
            return false;
        }
    }
}
