using System;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UIElements;
using ShipyardCat.Core;
using ShipyardCat.World;
using ShipyardCat.Player;
using ShipyardCat.AI;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace ShipyardCat.UI
{
    [RequireComponent(typeof(UIDocument))]
    public class ShipyardHUDController : MonoBehaviour
    {
        private const float ProtocolAutoHideSeconds = 4.5f;

        [Header("UI Assets (Optional Resources Fallback)")]
        [SerializeField] private VisualTreeAsset hudVisualTree;
        [SerializeField] private StyleSheet hudStyleSheet;

        private UIDocument _uiDocument;
        private VisualElement _root;

        // Vitals
        private VisualElement _healthBarFill;
        private VisualElement _staminaBarFill;
        private VisualElement _radBarFill;
        private Label _healthLabel;
        private Label _staminaLabel;
        private Label _radLabel;

        // Telemetry
        private Label _shiftLabel;
        private Label _zoneLabel;
        private Label _ratsLabel;
        private Label _scoreLabel;
        private Label _objectiveLabel;

        // Boss
        private VisualElement _bossContainer;
        private VisualElement _bossBarFill;
        private Label _bossHpLabel;

        // Protocol Overlay
        private VisualElement _protocolPanel;
        private Button _protocolToggleButton;
        private Button _protocolCloseButton;
        private VisualElement _vitalsCard;
        private VisualElement _toolbar;
        private bool _isProtocolVisible;
        private float _protocolHideTimer;
        private int _lastToggleFrame = -1;

        // End-Game Modal
        private VisualElement _endgameModal;
        private Label _endgameTitle;
        private Label _endgameSubtitle;
        private Button _restartButton;

        // Bound Domain References
        private CatVitals _boundVitals;
        private AlbaController _boundAlba;
        private DiurnalShiftManager _boundShiftManager;
        private ShipyardGameManager _boundGameManager;
        private KingpinBossAI _boundBoss;

        private void Awake()
        {
            _uiDocument = GetComponent<UIDocument>();
            EnsurePanelSettings();
        }

        private void OnEnable()
        {
            BuildOrBindVisualTree();
            TryBindDomainSystems();

            if (_boundVitals != null)
            {
                RefreshHUD(_boundVitals);
            }
        }

        private void Start()
        {
            TryBindDomainSystems();

            if (_boundVitals != null)
            {
                RefreshHUD(_boundVitals);
            }

            if (_boundShiftManager != null)
            {
                HandleShiftUpdated(_boundShiftManager.CurrentShift, _boundShiftManager.TimeOfDay);
            }

            if (_boundGameManager != null && !string.IsNullOrEmpty(_boundGameManager.CurrentObjective))
            {
                HandleObjectiveUpdated(_boundGameManager.CurrentObjective);
            }

            if (_boundBoss != null)
            {
                HandleBossStateChanged(_boundBoss.Health, _boundBoss.MaxHealth, _boundBoss.IsAggro);
            }
            else
            {
                SetBossBarVisible(false);
            }
        }

        private void Update()
        {
            if (_boundVitals == null || _boundAlba == null || _boundShiftManager == null ||
                _boundGameManager == null || _boundBoss == null)
            {
                TryBindDomainSystems();
            }

#if ENABLE_INPUT_SYSTEM
            if (_boundAlba == null && Keyboard.current != null && Keyboard.current.f1Key.wasPressedThisFrame)
            {
                ToggleProtocolOverlay();
            }
#endif

            if (_isProtocolVisible && _protocolHideTimer > 0f)
            {
                _protocolHideTimer -= Time.unscaledDeltaTime;
                if (_protocolHideTimer <= 0f)
                {
                    SetProtocolOverlayVisible(false);
                }
            }
        }

        private void OnDisable()
        {
            UnbindDomainSystems();

            if (_restartButton != null)
            {
                _restartButton.clicked -= HandleRestartClicked;
            }

            if (_protocolToggleButton != null)
            {
                _protocolToggleButton.clicked -= ToggleProtocolOverlay;
            }

            if (_protocolCloseButton != null)
            {
                _protocolCloseButton.clicked -= CloseProtocolOverlay;
            }
        }

        private void CloseProtocolOverlay() => SetProtocolOverlayVisible(false);

        public void SetGameplayHudVisible(bool visible)
        {
            var disp = visible ? DisplayStyle.Flex : DisplayStyle.None;
            if (_vitalsCard != null) _vitalsCard.style.display = disp;
            if (_toolbar != null) _toolbar.style.display = disp;
        }

        public void ToggleProtocolOverlay()
        {
            if (_lastToggleFrame == Time.frameCount)
            {
                return;
            }

            _lastToggleFrame = Time.frameCount;
            SetProtocolOverlayVisible(!_isProtocolVisible);
        }

        public void RefreshHUD(CatVitals vitals)
        {
            if (_root == null || vitals == null)
            {
                return;
            }

            float hpNorm = vitals.MaxHealth > 0f ? Mathf.Clamp01(vitals.Health / vitals.MaxHealth) : 0f;
            float stamNorm = vitals.MaxStamina > 0f ? Mathf.Clamp01(vitals.Stamina / vitals.MaxStamina) : 0f;
            float radNorm = vitals.MaxRadiation > 0f ? Mathf.Clamp01(vitals.Radiation / vitals.MaxRadiation) : 0f;

            if (_healthBarFill != null)
            {
                _healthBarFill.style.width = new Length(hpNorm * 100f, LengthUnit.Percent);
                _healthBarFill.style.backgroundColor = hpNorm <= 0.3f
                    ? new Color(0.92f, 0.24f, 0.24f, 1f)
                    : (hpNorm <= 0.6f ? new Color(0.95f, 0.65f, 0.16f, 1f) : new Color(0.20f, 0.84f, 0.48f, 1f));
            }

            if (_staminaBarFill != null)
            {
                _staminaBarFill.style.width = new Length(stamNorm * 100f, LengthUnit.Percent);
            }

            if (_radBarFill != null)
            {
                _radBarFill.style.width = new Length(radNorm * 100f, LengthUnit.Percent);
                _radBarFill.style.backgroundColor = radNorm >= 0.7f
                    ? new Color(0.95f, 0.28f, 0.22f, 1f)
                    : new Color(0.18f, 0.90f, 0.78f, 1f);
            }

            if (_healthLabel != null)
            {
                _healthLabel.text = $"{Mathf.CeilToInt(vitals.Health)} / {Mathf.CeilToInt(vitals.MaxHealth)}";
            }

            if (_staminaLabel != null)
            {
                _staminaLabel.text = $"{Mathf.CeilToInt(vitals.Stamina)} / {Mathf.CeilToInt(vitals.MaxStamina)}";
            }

            if (_radLabel != null)
            {
                _radLabel.text = $"{vitals.Radiation:0.0} mSv";
            }

            if (_ratsLabel != null)
            {
                _ratsLabel.text = $"{vitals.RatsCaught} / 10";
            }

            if (_scoreLabel != null)
            {
                _scoreLabel.text = $"{vitals.Score:N0}";
            }

            UpdateZoneDisplay(vitals.CurrentZone);

            if (vitals.IsVictorious)
            {
                ShowEndgameModal(
                    "SHIPYARD SECURED — VICTORY",
                    $"Kingpin neutralized! Rats Caught: {vitals.RatsCaught} | Final Score: {vitals.Score:N0}");
            }
            else if (vitals.IsFainted)
            {
                ShowEndgameModal(
                    "ALBA FAINTED — MEDEVAC",
                    $"Collapsed on shift. Rats Caught: {vitals.RatsCaught} | Final Score: {vitals.Score:N0}");
            }
            else
            {
                HideEndgameModal();
            }
        }

        private void EnsurePanelSettings()
        {
            if (_uiDocument == null)
            {
                return;
            }

            if (_uiDocument.panelSettings == null)
            {
                PanelSettings runtimeSettings = Resources.Load<PanelSettings>("UI/ShipyardPanelSettings");
                if (runtimeSettings == null)
                {
                    runtimeSettings = ScriptableObject.CreateInstance<PanelSettings>();
                    runtimeSettings.scaleMode = PanelScaleMode.ScaleWithScreenSize;
                    runtimeSettings.referenceResolution = new Vector2Int(1920, 1080);
                    runtimeSettings.match = 0.5f;
                }

                _uiDocument.panelSettings = runtimeSettings;
            }
        }

        private void BuildOrBindVisualTree()
        {
            if (_uiDocument == null)
            {
                return;
            }

            if (_uiDocument.visualTreeAsset == null)
            {
                VisualTreeAsset tree = hudVisualTree != null
                    ? hudVisualTree
                    : Resources.Load<VisualTreeAsset>("UI/ShipyardHUD");

                if (tree != null)
                {
                    _uiDocument.visualTreeAsset = tree;
                }
            }

            _root = _uiDocument.rootVisualElement;
            if (_root == null)
            {
                return;
            }

            StyleSheet sheet = hudStyleSheet != null
                ? hudStyleSheet
                : Resources.Load<StyleSheet>("UI/ShipyardHUD");

            if (sheet != null && !_root.styleSheets.Contains(sheet))
            {
                _root.styleSheets.Add(sheet);
            }

            if (_root.Q<VisualElement>("hud-root") == null)
            {
                BuildFallbackHierarchy(_root);
            }

            QueryElements();

            if (_restartButton != null)
            {
                _restartButton.clicked -= HandleRestartClicked;
                _restartButton.clicked += HandleRestartClicked;
            }

            if (_protocolToggleButton != null)
            {
                _protocolToggleButton.clicked -= ToggleProtocolOverlay;
                _protocolToggleButton.clicked += ToggleProtocolOverlay;
            }

            if (_protocolCloseButton != null)
            {
                _protocolCloseButton.clicked -= CloseProtocolOverlay;
                _protocolCloseButton.clicked += CloseProtocolOverlay;
            }

            SetBossBarVisible(false);
            SetProtocolOverlayVisible(false);
            HideEndgameModal();
        }

        private void QueryElements()
        {
            _healthBarFill = _root.Q<VisualElement>("health-bar-fill");
            _staminaBarFill = _root.Q<VisualElement>("stamina-bar-fill");
            _radBarFill = _root.Q<VisualElement>("rad-bar-fill");
            _healthLabel = _root.Q<Label>("health-label");
            _staminaLabel = _root.Q<Label>("stamina-label");
            _radLabel = _root.Q<Label>("rad-label");

            _shiftLabel = _root.Q<Label>("shift-label");
            _zoneLabel = _root.Q<Label>("zone-label");
            _ratsLabel = _root.Q<Label>("rats-label");
            _scoreLabel = _root.Q<Label>("score-label");
            _objectiveLabel = _root.Q<Label>("objective-label");

            _bossContainer = _root.Q<VisualElement>("boss-card") ?? _root.Q<VisualElement>("boss-container");
            _bossBarFill = _root.Q<VisualElement>("boss-health-fill") ?? _root.Q<VisualElement>("boss-bar-fill");
            _bossHpLabel = _root.Q<Label>("boss-health-label") ?? _root.Q<Label>("boss-hp-label");

            _protocolPanel = _root.Q<VisualElement>("protocol-overlay") ?? _root.Q<VisualElement>("protocol-panel");
            _protocolToggleButton = _root.Q<Button>("btn-protocol") ?? _root.Q<Button>("protocol-toggle-button");
            _protocolCloseButton = _root.Q<Button>("btn-close-protocol");
            _vitalsCard = _root.Q<VisualElement>("vitals-card");
            _toolbar = _root.Q<VisualElement>("toolbar");

            _endgameModal = _root.Q<VisualElement>("endgame-overlay") ?? _root.Q<VisualElement>("endgame-modal");
            _endgameTitle = _root.Q<Label>("endgame-title");
            _endgameSubtitle = _root.Q<Label>("endgame-subtitle");
            _restartButton = _root.Q<Button>("btn-endgame-restart") ?? _root.Q<Button>("restart-button");
        }

        private void TryBindDomainSystems()
        {
            if (_boundGameManager == null && ShipyardGameManager.Instance != null)
            {
                _boundGameManager = ShipyardGameManager.Instance;
                _boundGameManager.OnObjectiveUpdated += HandleObjectiveUpdated;
                if (!string.IsNullOrEmpty(_boundGameManager.CurrentObjective))
                {
                    HandleObjectiveUpdated(_boundGameManager.CurrentObjective);
                }
            }

            if (_boundShiftManager == null && DiurnalShiftManager.Instance != null)
            {
                _boundShiftManager = DiurnalShiftManager.Instance;
                _boundShiftManager.OnShiftUpdated += HandleShiftUpdated;
                HandleShiftUpdated(_boundShiftManager.CurrentShift, _boundShiftManager.TimeOfDay);
            }

            if (_boundAlba == null)
            {
                _boundAlba = FindAnyObjectByType<AlbaController>();
                if (_boundAlba != null)
                {
                    _boundAlba.OnToggleProtocolHUDRequested += ToggleProtocolOverlay;
                }
            }

            if (_boundVitals == null)
            {
                CatVitals vitals = _boundGameManager != null && _boundGameManager.PlayerVitals != null
                    ? _boundGameManager.PlayerVitals
                    : (_boundAlba != null && _boundAlba.Vitals != null
                        ? _boundAlba.Vitals
                        : FindAnyObjectByType<CatVitals>());

                if (vitals != null)
                {
                    _boundVitals = vitals;
                    _boundVitals.OnVitalsChanged += RefreshHUD;
                    _boundVitals.OnAlbaFainted += HandleAlbaFainted;
                    _boundVitals.OnVictory += HandleVictory;
                    _boundVitals.OnZoneChanged += UpdateZoneDisplay;
                    RefreshHUD(_boundVitals);
                }
            }

            if (_boundBoss == null)
            {
                _boundBoss = KingpinBossAI.Instance != null
                    ? KingpinBossAI.Instance
                    : FindAnyObjectByType<KingpinBossAI>();

                if (_boundBoss != null)
                {
                    _boundBoss.OnBossStateChanged += HandleBossStateChanged;
                    HandleBossStateChanged(_boundBoss.Health, _boundBoss.MaxHealth, _boundBoss.IsAggro);
                }
            }
        }

        private void UnbindDomainSystems()
        {
            if (_boundGameManager != null)
            {
                _boundGameManager.OnObjectiveUpdated -= HandleObjectiveUpdated;
                _boundGameManager = null;
            }

            if (_boundShiftManager != null)
            {
                _boundShiftManager.OnShiftUpdated -= HandleShiftUpdated;
                _boundShiftManager = null;
            }

            if (_boundAlba != null)
            {
                _boundAlba.OnToggleProtocolHUDRequested -= ToggleProtocolOverlay;
                _boundAlba = null;
            }

            if (_boundVitals != null)
            {
                _boundVitals.OnVitalsChanged -= RefreshHUD;
                _boundVitals.OnAlbaFainted -= HandleAlbaFainted;
                _boundVitals.OnVictory -= HandleVictory;
                _boundVitals.OnZoneChanged -= UpdateZoneDisplay;
                _boundVitals = null;
            }

            if (_boundBoss != null)
            {
                _boundBoss.OnBossStateChanged -= HandleBossStateChanged;
                _boundBoss = null;
            }
        }

        private void HandleShiftUpdated(ShiftPeriod shift, float hour24)
        {
            if (_shiftLabel == null)
            {
                return;
            }

            int hours = Mathf.FloorToInt(hour24) % 24;
            int minutes = Mathf.FloorToInt((hour24 - Mathf.Floor(hour24)) * 60f);
            string shiftText = _boundShiftManager != null && !string.IsNullOrEmpty(_boundShiftManager.FormattedShiftName)
                ? _boundShiftManager.FormattedShiftName
                : FormatShiftName(shift);

            _shiftLabel.text = $"{hours:00}:{minutes:00} // {shiftText}";
        }

        private void UpdateZoneDisplay(ShipyardZone zone)
        {
            if (_zoneLabel == null)
            {
                return;
            }

            _zoneLabel.text = FormatZoneName(zone);
        }

        private void HandleObjectiveUpdated(string objective)
        {
            if (_objectiveLabel == null)
            {
                return;
            }

            _objectiveLabel.text = string.IsNullOrWhiteSpace(objective)
                ? "PATROL NEWPORT NEWS YARD"
                : objective;
        }

        private void HandleBossStateChanged(float currentHealth, float maxHealth, bool isAggro)
        {
            bool showBoss = isAggro && currentHealth > 0f;
            SetBossBarVisible(showBoss);

            if (!showBoss)
            {
                return;
            }

            float norm = maxHealth > 0f ? Mathf.Clamp01(currentHealth / maxHealth) : 0f;
            if (_bossBarFill != null)
            {
                _bossBarFill.style.width = new Length(norm * 100f, LengthUnit.Percent);
            }

            if (_bossHpLabel != null)
            {
                _bossHpLabel.text = $"THE KINGPIN // {Mathf.CeilToInt(currentHealth)} / {Mathf.CeilToInt(maxHealth)}";
            }
        }

        private void HandleAlbaFainted()
        {
            if (_boundVitals != null)
            {
                RefreshHUD(_boundVitals);
            }
            else
            {
                ShowEndgameModal("ALBA FAINTED — MEDEVAC", "Collapsed on shift. Restart to resume yard patrol.");
            }
        }

        private void HandleVictory()
        {
            if (_boundVitals != null)
            {
                RefreshHUD(_boundVitals);
            }
            else
            {
                ShowEndgameModal("SHIPYARD SECURED — VICTORY", "Dry Dock 1 Kingpin defeated!");
            }
        }

        private void HandleRestartClicked()
        {
            HideEndgameModal();
            SetBossBarVisible(false);

            if (ShipyardGameManager.Instance != null)
            {
                ShipyardGameManager.Instance.RestartMission();
            }
            else
            {
                Scene activeScene = SceneManager.GetActiveScene();
                SceneManager.LoadScene(activeScene.buildIndex);
            }
        }

        private void SetBossBarVisible(bool visible)
        {
            if (_bossContainer != null)
            {
                _bossContainer.style.display = visible ? DisplayStyle.Flex : DisplayStyle.None;
            }
        }

        private void SetProtocolOverlayVisible(bool visible)
        {
            _isProtocolVisible = visible;
            _protocolHideTimer = visible ? ProtocolAutoHideSeconds : 0f;

            if (_protocolPanel != null)
            {
                _protocolPanel.style.display = visible ? DisplayStyle.Flex : DisplayStyle.None;
            }
        }

        private void ShowEndgameModal(string title, string subtitle)
        {
            if (_endgameTitle != null)
            {
                _endgameTitle.text = title;
            }

            if (_endgameSubtitle != null)
            {
                _endgameSubtitle.text = subtitle;
            }

            if (_endgameModal != null)
            {
                _endgameModal.style.display = DisplayStyle.Flex;
            }
        }

        private void HideEndgameModal()
        {
            if (_endgameModal != null)
            {
                _endgameModal.style.display = DisplayStyle.None;
            }
        }

        private static string FormatShiftName(ShiftPeriod shift)
        {
            switch (shift)
            {
                case ShiftPeriod.FirstShift_Day:
                    return "1ST SHIFT (DAY)";
                case ShiftPeriod.SecondShift_Dusk:
                    return "2ND SHIFT (DUSK)";
                case ShiftPeriod.ThirdShift_Night:
                    return "3RD SHIFT (NIGHT)";
                default:
                    return "SHIFT ACTIVE";
            }
        }

        private static string FormatZoneName(ShipyardZone zone)
        {
            switch (zone)
            {
                case ShipyardZone.YardGeneral:
                    return "NNSB MAIN PIER";
                case ShipyardZone.DryDock12_CVN80:
                    return "DRY DOCK 12 // CVN-80";
                case ShipyardZone.DryDock2_SSNVirginia:
                    return "DRY DOCK 2 // SSN RAD ZONE";
                case ShipyardZone.HeavySteelFabShop:
                    return "HEAVY STEEL FAB SHOP";
                case ShipyardZone.CatHavenSanctuary:
                    return "CAT HAVEN SANCTUARY";
                case ShipyardZone.DryDock1_KingpinBasin:
                    return "DRY DOCK 1 // KINGPIN BASIN";
                default:
                    return "SHIPYARD";
            }
        }

        private static void BuildFallbackHierarchy(VisualElement root)
        {
            root.Clear();

            Color panelBg = new Color(0.043f, 0.075f, 0.118f, 0.84f);
            Color borderAmber = new Color(0.95f, 0.68f, 0.16f, 0.85f);
            Color borderCyan = new Color(0.18f, 0.82f, 0.92f, 0.85f);
            Color trackBg = new Color(0.10f, 0.14f, 0.20f, 0.95f);

            VisualElement hudRoot = new VisualElement { name = "hud-root" };
            hudRoot.style.flexGrow = 1f;
            hudRoot.style.paddingLeft = 20f;
            hudRoot.style.paddingRight = 20f;
            hudRoot.style.paddingTop = 18f;
            hudRoot.style.paddingBottom = 18f;
            hudRoot.style.justifyContent = Justify.SpaceBetween;
            hudRoot.pickingMode = PickingMode.Ignore;
            root.Add(hudRoot);

            VisualElement topRow = new VisualElement();
            topRow.style.flexDirection = FlexDirection.Row;
            topRow.style.justifyContent = Justify.SpaceBetween;
            topRow.style.alignItems = Align.FlexStart;
            topRow.pickingMode = PickingMode.Ignore;
            hudRoot.Add(topRow);

            // Top-Left Vitals Card
            VisualElement vitalsCard = CreateCard(panelBg, borderAmber, 290f);
            topRow.Add(vitalsCard);

            Label vitalsHeader = new Label("ALBA // YARD PATROL VITALS");
            vitalsHeader.style.color = borderAmber;
            vitalsHeader.style.fontSize = 12f;
            vitalsHeader.style.unityFontStyleAndWeight = FontStyle.Bold;
            vitalsHeader.style.marginBottom = 6f;
            vitalsCard.Add(vitalsHeader);

            CreateBarRow(vitalsCard, "HEALTH", "health-bar-fill", "health-label",
                trackBg, new Color(0.20f, 0.84f, 0.48f, 1f), "100 / 100");
            CreateBarRow(vitalsCard, "STAMINA", "stamina-bar-fill", "stamina-label",
                trackBg, new Color(0.96f, 0.72f, 0.18f, 1f), "100 / 100");
            CreateBarRow(vitalsCard, "RADIATION", "rad-bar-fill", "rad-label",
                trackBg, new Color(0.18f, 0.90f, 0.78f, 1f), "0.0 mSv");

            // Top-Center Boss Bar
            VisualElement bossContainer = CreateCard(panelBg, new Color(0.92f, 0.22f, 0.22f, 0.95f), 420f);
            bossContainer.name = "boss-container";
            bossContainer.style.display = DisplayStyle.None;
            topRow.Add(bossContainer);

            Label bossHpLabel = new Label("THE KINGPIN // 300 / 300") { name = "boss-hp-label" };
            bossHpLabel.style.color = new Color(1f, 0.36f, 0.36f, 1f);
            bossHpLabel.style.fontSize = 13f;
            bossHpLabel.style.unityFontStyleAndWeight = FontStyle.Bold;
            bossHpLabel.style.unityTextAlign = TextAnchor.MiddleCenter;
            bossHpLabel.style.marginBottom = 6f;
            bossContainer.Add(bossHpLabel);

            VisualElement bossTrack = new VisualElement();
            bossTrack.style.height = 14f;
            bossTrack.style.backgroundColor = trackBg;
            bossTrack.style.borderTopLeftRadius = 4f;
            bossTrack.style.borderTopRightRadius = 4f;
            bossTrack.style.borderBottomLeftRadius = 4f;
            bossTrack.style.borderBottomRightRadius = 4f;
            bossTrack.style.overflow = Overflow.Hidden;
            bossContainer.Add(bossTrack);

            VisualElement bossFill = new VisualElement { name = "boss-bar-fill" };
            bossFill.style.height = new Length(100f, LengthUnit.Percent);
            bossFill.style.width = new Length(100f, LengthUnit.Percent);
            bossFill.style.backgroundColor = new Color(0.88f, 0.16f, 0.20f, 1f);
            bossTrack.Add(bossFill);

            // Top-Right Telemetry Card
            VisualElement telemetryCard = CreateCard(panelBg, borderCyan, 320f);
            topRow.Add(telemetryCard);

            Label shiftLabel = CreateTelemetryLabel("shift-label", "13:30 // 1ST SHIFT (DAY)", borderCyan, 13f, FontStyle.Bold);
            Label zoneLabel = CreateTelemetryLabel("zone-label", "ZONE: NNSB MAIN PIER", Color.white, 12f, FontStyle.Bold);
            Label ratsLabel = CreateTelemetryLabel("rats-label", "RATS CAUGHT: 0", new Color(0.95f, 0.85f, 0.45f, 1f), 12f, FontStyle.Normal);
            Label scoreLabel = CreateTelemetryLabel("score-label", "SCORE: 0", new Color(0.75f, 0.92f, 1f, 1f), 12f, FontStyle.Normal);
            Label objectiveLabel = CreateTelemetryLabel("objective-label", "PATROL NEWPORT NEWS YARD", new Color(0.95f, 0.76f, 0.30f, 1f), 12f, FontStyle.Bold);
            objectiveLabel.style.whiteSpace = WhiteSpace.Normal;

            telemetryCard.Add(shiftLabel);
            telemetryCard.Add(zoneLabel);
            telemetryCard.Add(ratsLabel);
            telemetryCard.Add(scoreLabel);
            telemetryCard.Add(objectiveLabel);

            // Bottom Row: Protocol Panel + Toggle Button
            VisualElement bottomRow = new VisualElement();
            bottomRow.style.flexDirection = FlexDirection.Column;
            bottomRow.style.alignItems = Align.FlexStart;
            bottomRow.pickingMode = PickingMode.Ignore;
            hudRoot.Add(bottomRow);

            VisualElement protocolPanel = CreateCard(panelBg, borderCyan, 340f);
            protocolPanel.name = "protocol-panel";
            protocolPanel.style.marginBottom = 8f;
            protocolPanel.style.display = DisplayStyle.None;
            bottomRow.Add(protocolPanel);

            Label protocolTitle = new Label("[F1] NNSB YARD PROTOCOL CONTROLS");
            protocolTitle.style.color = borderCyan;
            protocolTitle.style.fontSize = 12f;
            protocolTitle.style.unityFontStyleAndWeight = FontStyle.Bold;
            protocolTitle.style.marginBottom = 4f;
            protocolPanel.Add(protocolTitle);

            Label protocolBody = new Label(
                "WASD / Arrows: Move   |   Shift: Sprint\n" +
                "Space: Jump            |   J: Paw Swipe\n" +
                "F: Pounce Strike       |   Q: Whiskers Sonar\n" +
                "N: Toggle Night Shift  |   F1: Toggle Controls");
            protocolBody.style.color = new Color(0.88f, 0.93f, 0.98f, 1f);
            protocolBody.style.fontSize = 11f;
            protocolPanel.Add(protocolBody);

            Button protocolBtn = new Button { name = "protocol-toggle-button", text = "[F1] CONTROLS" };
            protocolBtn.style.backgroundColor = panelBg;
            protocolBtn.style.color = borderCyan;
            protocolBtn.style.borderTopWidth = 1f;
            protocolBtn.style.borderBottomWidth = 1f;
            protocolBtn.style.borderLeftWidth = 1f;
            protocolBtn.style.borderRightWidth = 1f;
            protocolBtn.style.borderTopColor = borderCyan;
            protocolBtn.style.borderBottomColor = borderCyan;
            protocolBtn.style.borderLeftColor = borderCyan;
            protocolBtn.style.borderRightColor = borderCyan;
            protocolBtn.style.paddingLeft = 10f;
            protocolBtn.style.paddingRight = 10f;
            protocolBtn.style.paddingTop = 5f;
            protocolBtn.style.paddingBottom = 5f;
            protocolBtn.style.fontSize = 11f;
            bottomRow.Add(protocolBtn);

            // Center Endgame Modal
            VisualElement modal = new VisualElement { name = "endgame-modal" };
            modal.style.position = Position.Absolute;
            modal.style.left = 0f;
            modal.style.right = 0f;
            modal.style.top = 0f;
            modal.style.bottom = 0f;
            modal.style.backgroundColor = new Color(0.02f, 0.04f, 0.07f, 0.76f);
            modal.style.alignItems = Align.Center;
            modal.style.justifyContent = Justify.Center;
            modal.style.display = DisplayStyle.None;
            hudRoot.Add(modal);

            VisualElement modalBox = CreateCard(new Color(0.05f, 0.08f, 0.13f, 0.96f), borderAmber, 440f);
            modalBox.style.alignItems = Align.Center;
            modalBox.style.paddingTop = 24f;
            modalBox.style.paddingBottom = 24f;
            modal.Add(modalBox);

            Label endgameTitle = new Label("MISSION COMPLETE") { name = "endgame-title" };
            endgameTitle.style.color = borderAmber;
            endgameTitle.style.fontSize = 20f;
            endgameTitle.style.unityFontStyleAndWeight = FontStyle.Bold;
            endgameTitle.style.marginBottom = 8f;
            endgameTitle.style.unityTextAlign = TextAnchor.MiddleCenter;
            modalBox.Add(endgameTitle);

            Label endgameSubtitle = new Label("Shipyard status updated.") { name = "endgame-subtitle" };
            endgameSubtitle.style.color = Color.white;
            endgameSubtitle.style.fontSize = 13f;
            endgameSubtitle.style.marginBottom = 18f;
            endgameSubtitle.style.whiteSpace = WhiteSpace.Normal;
            endgameSubtitle.style.unityTextAlign = TextAnchor.MiddleCenter;
            modalBox.Add(endgameSubtitle);

            Button restartBtn = new Button { name = "restart-button", text = "RESTART SHIFT" };
            restartBtn.style.backgroundColor = borderAmber;
            restartBtn.style.color = new Color(0.05f, 0.08f, 0.12f, 1f);
            restartBtn.style.unityFontStyleAndWeight = FontStyle.Bold;
            restartBtn.style.paddingLeft = 20f;
            restartBtn.style.paddingRight = 20f;
            restartBtn.style.paddingTop = 8f;
            restartBtn.style.paddingBottom = 8f;
            modalBox.Add(restartBtn);
        }

        private static VisualElement CreateCard(Color bg, Color border, float width)
        {
            VisualElement card = new VisualElement();
            card.style.width = width;
            card.style.backgroundColor = bg;
            card.style.paddingLeft = 12f;
            card.style.paddingRight = 12f;
            card.style.paddingTop = 10f;
            card.style.paddingBottom = 10f;
            card.style.borderTopWidth = 1f;
            card.style.borderBottomWidth = 1f;
            card.style.borderLeftWidth = 1f;
            card.style.borderRightWidth = 1f;
            card.style.borderTopColor = border;
            card.style.borderBottomColor = border;
            card.style.borderLeftColor = border;
            card.style.borderRightColor = border;
            card.style.borderTopLeftRadius = 6f;
            card.style.borderTopRightRadius = 6f;
            card.style.borderBottomLeftRadius = 6f;
            card.style.borderBottomRightRadius = 6f;
            return card;
        }

        private static void CreateBarRow(
            VisualElement parent,
            string title,
            string fillName,
            string labelName,
            Color trackColor,
            Color fillColor,
            string defaultText)
        {
            VisualElement header = new VisualElement();
            header.style.flexDirection = FlexDirection.Row;
            header.style.justifyContent = Justify.SpaceBetween;
            header.style.marginBottom = 2f;
            parent.Add(header);

            Label nameLabel = new Label(title);
            nameLabel.style.color = new Color(0.82f, 0.88f, 0.94f, 1f);
            nameLabel.style.fontSize = 11f;
            header.Add(nameLabel);

            Label valueLabel = new Label(defaultText) { name = labelName };
            valueLabel.style.color = Color.white;
            valueLabel.style.fontSize = 11f;
            header.Add(valueLabel);

            VisualElement track = new VisualElement();
            track.style.height = 10f;
            track.style.backgroundColor = trackColor;
            track.style.marginBottom = 6f;
            track.style.borderTopLeftRadius = 3f;
            track.style.borderTopRightRadius = 3f;
            track.style.borderBottomLeftRadius = 3f;
            track.style.borderBottomRightRadius = 3f;
            track.style.overflow = Overflow.Hidden;
            parent.Add(track);

            VisualElement fill = new VisualElement { name = fillName };
            fill.style.height = new Length(100f, LengthUnit.Percent);
            fill.style.width = new Length(100f, LengthUnit.Percent);
            fill.style.backgroundColor = fillColor;
            track.Add(fill);
        }

        private static Label CreateTelemetryLabel(string name, string text, Color color, float fontSize, FontStyle fontStyle)
        {
            Label label = new Label(text) { name = name };
            label.style.color = color;
            label.style.fontSize = fontSize;
            label.style.unityFontStyleAndWeight = fontStyle;
            label.style.marginBottom = 3f;
            return label;
        }
    }
}
