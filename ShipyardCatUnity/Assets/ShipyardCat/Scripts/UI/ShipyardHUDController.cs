using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.SceneManagement;
using UnityEngine.UIElements;
using ShipyardCat.AI;
using ShipyardCat.Core;
using ShipyardCat.Player;
using ShipyardCat.World;

namespace ShipyardCat.UI
{
    [RequireComponent(typeof(UIDocument))]
    public class ShipyardHUDController : MonoBehaviour
    {
        private const int MaxRadarBlips = 48;
        private const float ToastDurationSeconds = 3.5f;
        private const float DialogueDurationSeconds = 5.0f;

        private UIDocument _uiDocument;
        private VisualElement _root;
        private bool _isBound;

        // Gameplay HUD containers
        private VisualElement _vitalsCard;
        private VisualElement _missionCard;
        private VisualElement _radarCard;
        private VisualElement _topBar;
        private VisualElement _bottomDock;
        private VisualElement _toolbar;

        // Vitals bars & labels
        private VisualElement _healthBarFill;
        private VisualElement _staminaBarFill;
        private VisualElement _radBarFill;
        private VisualElement _barWarmth;
        private VisualElement _barFullness;
        private Label _healthLabel;
        private Label _staminaLabel;
        private Label _radLabel;

        // Top bar / stats labels
        private Label _shiftLabel;
        private Label _zoneLabel;
        private Label _waveLabel;
        private Label _ratsLabel;
        private Label _verminLabel;
        private Label _integrityLabel;
        private Label _scoreLabel;

        // Mission labels
        private Label _objectiveLabel;
        private Label _missionDesc;
        private Label _missionProgress;

        // Boss HUD
        private VisualElement _bossCard;
        private Label _bossNameLabel;
        private Label _bossHealthLabel;
        private VisualElement _bossHealthFill;

        // Radar
        private VisualElement _radarCircle;
        private VisualElement _radarBlipsLayer;
        private readonly List<RadarBlip> _radarBlipBuffer = new List<RadarBlip>(MaxRadarBlips);
        private readonly List<VisualElement> _radarBlipPool = new List<VisualElement>(MaxRadarBlips);
        private int _activeBlipCount;

        // Prompts & toasts
        private VisualElement _contextualPromptBar;
        private Label _contextualPromptLabel;
        private VisualElement _toastBanner;
        private Label _toastLabel;

        // Buttons & overlays
        private Button _btnNightShift;
        private Button _btnProtocol;
        private Button _btnCloseProtocol;
        private VisualElement _protocolOverlay;

        private Button _btnLogbook;
        private Button _btnCloseLogbook;
        private VisualElement _logbookOverlay;
        private Label _logbookRankLabel;
        private Label _logbookXpLabel;
        private VisualElement _logbookActsContainer;
        private Button _btnPerkAgility;
        private Button _btnPerkStealth;
        private Button _btnPerkCombat;
        private Button _btnPerkRad;

        private Button _btnRestart;
        private VisualElement _endgameOverlay;
        private Label _endgameTitle;
        private Label _endgameSubtitle;
        private Button _btnEndgameRestart;

        // Scene references
        private CatVitals _catVitals;
        private DiurnalShiftManager _shiftManager;
        private KingpinBossAI _kingpinBoss;
        private LieutenantCobaltBossAI _cobaltBoss;
        private TacticalRadarController _radarController;
        private ShipyardProgressBridge _progressBridge;
        private MissionManager _missionManager;

        // Subscription tracking
        private bool _subscribedVitals;
        private bool _subscribedShift;
        private bool _subscribedKingpin;
        private bool _subscribedCobalt;
        private bool _subscribedProgress;
        private bool _subscribedMission;
        private bool _subscribedStatic;

        // Cached state
        private float _toastTimer;
        private float _promptTimer;
        private int _lastRatsCaught;
        private int _lastActiveVermin;
        private int _lastDefeatedVermin;
        private int _agilityTier = 1;
        private int _stealthTier = 1;
        private int _combatTier = 1;
        private int _radTier = 1;
        private bool _gameplayHudVisible = true;

        private void Awake()
        {
            _uiDocument = GetComponent<UIDocument>();
        }

        private void OnEnable()
        {
            BindUI();
            ResolveAndSubscribeSceneReferences();
            SubscribeStaticEvents();
            PerformInitialSync();
        }

        private void Start()
        {
            ResolveAndSubscribeSceneReferences();
            PerformInitialSync();
        }

        private void OnDisable()
        {
            UnsubscribeAll();
            UnbindUI();
        }

        private void Update()
        {
            var kb = Keyboard.current;
            if (kb != null && kb.tabKey.wasPressedThisFrame)
            {
                ToggleLogbookOverlay();
            }

            if (_toastTimer > 0f)
            {
                _toastTimer -= Time.unscaledDeltaTime;
                if (_toastTimer <= 0f && _toastBanner != null)
                {
                    _toastBanner.style.display = DisplayStyle.None;
                }
            }

            if (_promptTimer > 0f)
            {
                _promptTimer -= Time.unscaledDeltaTime;
                if (_promptTimer <= 0f && _contextualPromptBar != null)
                {
                    _contextualPromptBar.style.display = DisplayStyle.None;
                }
            }

            UpdateRadar();
        }

        public void ToggleProtocolOverlay()
        {
            EnsureBound();
            if (_protocolOverlay == null)
            {
                return;
            }

            bool show = _protocolOverlay.style.display != DisplayStyle.Flex;
            _protocolOverlay.style.display = show ? DisplayStyle.Flex : DisplayStyle.None;

            if (show && _logbookOverlay != null)
            {
                _logbookOverlay.style.display = DisplayStyle.None;
            }
        }

        public void SetGameplayHudVisible(bool visible)
        {
            _gameplayHudVisible = visible;
            EnsureBound();

            DisplayStyle display = visible ? DisplayStyle.Flex : DisplayStyle.None;
            SetElementDisplay(_vitalsCard, display);
            SetElementDisplay(_missionCard, display);
            SetElementDisplay(_radarCard, display);
            SetElementDisplay(_topBar, display);
            SetElementDisplay(_bottomDock, display);
            SetElementDisplay(_toolbar, display);

            if (!visible)
            {
                SetElementDisplay(_bossCard, DisplayStyle.None);
                SetElementDisplay(_contextualPromptBar, DisplayStyle.None);
            }
        }

        public void RefreshHUD(CatVitals vitals)
        {
            EnsureBound();
            if (vitals == null)
            {
                return;
            }

            float healthRatio = vitals.MaxHealth > 0f ? Mathf.Clamp01(vitals.Health / vitals.MaxHealth) : 0f;
            float staminaRatio = vitals.MaxStamina > 0f ? Mathf.Clamp01(vitals.Stamina / vitals.MaxStamina) : 0f;
            float radRatio = vitals.MaxRadiation > 0f ? Mathf.Clamp01(vitals.Radiation / vitals.MaxRadiation) : 0f;

            if (_healthBarFill != null)
            {
                _healthBarFill.style.width = Length.Percent(healthRatio * 100f);
            }

            if (_staminaBarFill != null)
            {
                _staminaBarFill.style.width = Length.Percent(staminaRatio * 100f);
            }

            if (_radBarFill != null)
            {
                _radBarFill.style.width = Length.Percent(radRatio * 100f);
            }

            if (_barWarmth != null)
            {
                float warmthPct = _shiftManager != null && _shiftManager.FormattedShiftName != null &&
                                  _shiftManager.FormattedShiftName.IndexOf("Night", StringComparison.OrdinalIgnoreCase) >= 0
                    ? 75f
                    : 100f;
                _barWarmth.style.width = Length.Percent(warmthPct);
            }

            if (_barFullness != null)
            {
                _barFullness.style.width = Length.Percent(Mathf.Lerp(50f, 100f, healthRatio));
            }

            if (_healthLabel != null)
            {
                _healthLabel.text = $"{Mathf.CeilToInt(vitals.Health)}/{Mathf.CeilToInt(vitals.MaxHealth)}";
            }

            if (_staminaLabel != null)
            {
                _staminaLabel.text = $"{Mathf.CeilToInt(vitals.Stamina)}/{Mathf.CeilToInt(vitals.MaxStamina)}";
            }

            if (_radLabel != null)
            {
                _radLabel.text = $"{Mathf.RoundToInt(radRatio * 100f)}%";
            }

            _lastRatsCaught = vitals.RatsCaught;
            if (_ratsLabel != null)
            {
                _ratsLabel.text = $"Rats: {_lastRatsCaught}";
            }

            UpdateScoreLabel();

            if (vitals.IsVictorious)
            {
                ShowEndgame(true);
            }
            else if (vitals.IsFainted)
            {
                ShowEndgame(false);
            }
        }

        private void EnsureBound()
        {
            if (!_isBound && !_isBinding)
            {
                BindUI();
            }
        }

        private bool _isBinding;

        private void BindUI()
        {
            if (_isBound || _isBinding)
            {
                return;
            }
            _isBinding = true;

            if (_uiDocument == null)
            {
                _uiDocument = GetComponent<UIDocument>();
            }

            _root = _uiDocument != null ? _uiDocument.rootVisualElement : null;
            if (_root == null)
            {
                _isBinding = false;
                return;
            }

            _vitalsCard = _root.Q<VisualElement>("vitals-card");
            _missionCard = _root.Q<VisualElement>("mission-card");
            _radarCard = _root.Q<VisualElement>("radar-card");
            _topBar = _root.Q<VisualElement>("top-bar");
            _bottomDock = _root.Q<VisualElement>("bottom-dock");
            _toolbar = _root.Q<VisualElement>("toolbar");

            _healthBarFill = _root.Q<VisualElement>("health-bar-fill");
            _staminaBarFill = _root.Q<VisualElement>("stamina-bar-fill");
            _radBarFill = _root.Q<VisualElement>("rad-bar-fill");
            _barWarmth = _root.Q<VisualElement>("bar-warmth");
            _barFullness = _root.Q<VisualElement>("bar-fullness");
            _healthLabel = _root.Q<Label>("health-label");
            _staminaLabel = _root.Q<Label>("stamina-label");
            _radLabel = _root.Q<Label>("rad-label");

            _shiftLabel = _root.Q<Label>("shift-label");
            _zoneLabel = _root.Q<Label>("zone-label");
            _waveLabel = _root.Q<Label>("wave-label");
            _ratsLabel = _root.Q<Label>("rats-label");
            _verminLabel = _root.Q<Label>("vermin-label");
            _integrityLabel = _root.Q<Label>("integrity-label");
            _scoreLabel = _root.Q<Label>("score-label");

            _objectiveLabel = _root.Q<Label>("objective-label");
            _missionDesc = _root.Q<Label>("mission-desc");
            _missionProgress = _root.Q<Label>("mission-progress");

            _bossCard = _root.Q<VisualElement>("boss-card");
            _bossNameLabel = _root.Q<Label>("boss-name-label");
            _bossHealthLabel = _root.Q<Label>("boss-health-label");
            _bossHealthFill = _root.Q<VisualElement>("boss-health-fill");

            _radarCircle = _root.Q<VisualElement>("radar-circle");
            _radarBlipsLayer = _root.Q<VisualElement>("radar-blips-layer");
            InitializeRadarPool();

            _contextualPromptBar = _root.Q<VisualElement>("contextual-prompt-bar");
            _contextualPromptLabel = _root.Q<Label>("contextual-prompt-label");
            _toastBanner = _root.Q<VisualElement>("toast-banner");
            _toastLabel = _root.Q<Label>("toast-label");

            _btnNightShift = _root.Q<Button>("btn-night-shift");
            _btnProtocol = _root.Q<Button>("btn-protocol");
            _btnCloseProtocol = _root.Q<Button>("btn-close-protocol");
            _protocolOverlay = _root.Q<VisualElement>("protocol-overlay");

            _btnLogbook = _root.Q<Button>("btn-logbook");
            _btnCloseLogbook = _root.Q<Button>("btn-close-logbook");
            _logbookOverlay = _root.Q<VisualElement>("logbook-overlay");
            _logbookRankLabel = _root.Q<Label>("logbook-rank-label");
            _logbookXpLabel = _root.Q<Label>("logbook-xp-label");
            _logbookActsContainer = _root.Q<VisualElement>("logbook-acts-container");
            _btnPerkAgility = _root.Q<Button>("btn-perk-agility");
            _btnPerkStealth = _root.Q<Button>("btn-perk-stealth");
            _btnPerkCombat = _root.Q<Button>("btn-perk-combat");
            _btnPerkRad = _root.Q<Button>("btn-perk-rad");

            _btnRestart = _root.Q<Button>("btn-restart");
            _endgameOverlay = _root.Q<VisualElement>("endgame-overlay");
            _endgameTitle = _root.Q<Label>("endgame-title");
            _endgameSubtitle = _root.Q<Label>("endgame-subtitle");
            _btnEndgameRestart = _root.Q<Button>("btn-endgame-restart");

            RegisterCallbacks();

            SetElementDisplay(_bossCard, DisplayStyle.None);
            SetElementDisplay(_contextualPromptBar, DisplayStyle.None);
            SetElementDisplay(_toastBanner, DisplayStyle.None);
            SetElementDisplay(_protocolOverlay, DisplayStyle.None);
            SetElementDisplay(_logbookOverlay, DisplayStyle.None);
            SetElementDisplay(_endgameOverlay, DisplayStyle.None);

            if (_zoneLabel != null && string.IsNullOrEmpty(_zoneLabel.text))
            {
                _zoneLabel.text = "SHIPYARD";
            }

            _isBinding = false;
            _isBound = true;
            SetGameplayHudVisible(_gameplayHudVisible);
        }

        private void UnbindUI()
        {
            if (!_isBound)
            {
                return;
            }

            UnregisterCallbacks();
            _radarBlipPool.Clear();
            _activeBlipCount = 0;
            _isBound = false;
        }

        private void RegisterCallbacks()
        {
            if (_btnNightShift != null) _btnNightShift.clicked += HandleNightShiftClicked;
            if (_btnProtocol != null) _btnProtocol.clicked += ToggleProtocolOverlay;
            if (_btnCloseProtocol != null) _btnCloseProtocol.clicked += HandleCloseProtocolClicked;
            if (_btnLogbook != null) _btnLogbook.clicked += ToggleLogbookOverlay;
            if (_btnCloseLogbook != null) _btnCloseLogbook.clicked += HandleCloseLogbookClicked;
            if (_btnPerkAgility != null) _btnPerkAgility.clicked += HandleAgilityPerkClicked;
            if (_btnPerkStealth != null) _btnPerkStealth.clicked += HandleStealthPerkClicked;
            if (_btnPerkCombat != null) _btnPerkCombat.clicked += HandleCombatPerkClicked;
            if (_btnPerkRad != null) _btnPerkRad.clicked += HandleRadPerkClicked;
            if (_btnRestart != null) _btnRestart.clicked += HandleRestartClicked;
            if (_btnEndgameRestart != null) _btnEndgameRestart.clicked += HandleRestartClicked;
            if (_radarCircle != null) _radarCircle.RegisterCallback<ClickEvent>(HandleRadarClicked);
        }

        private void UnregisterCallbacks()
        {
            if (_btnNightShift != null) _btnNightShift.clicked -= HandleNightShiftClicked;
            if (_btnProtocol != null) _btnProtocol.clicked -= ToggleProtocolOverlay;
            if (_btnCloseProtocol != null) _btnCloseProtocol.clicked -= HandleCloseProtocolClicked;
            if (_btnLogbook != null) _btnLogbook.clicked -= ToggleLogbookOverlay;
            if (_btnCloseLogbook != null) _btnCloseLogbook.clicked -= HandleCloseLogbookClicked;
            if (_btnPerkAgility != null) _btnPerkAgility.clicked -= HandleAgilityPerkClicked;
            if (_btnPerkStealth != null) _btnPerkStealth.clicked -= HandleStealthPerkClicked;
            if (_btnPerkCombat != null) _btnPerkCombat.clicked -= HandleCombatPerkClicked;
            if (_btnPerkRad != null) _btnPerkRad.clicked -= HandleRadPerkClicked;
            if (_btnRestart != null) _btnRestart.clicked -= HandleRestartClicked;
            if (_btnEndgameRestart != null) _btnEndgameRestart.clicked -= HandleRestartClicked;
            if (_radarCircle != null) _radarCircle.UnregisterCallback<ClickEvent>(HandleRadarClicked);
        }

        private void InitializeRadarPool()
        {
            _radarBlipPool.Clear();
            _activeBlipCount = 0;

            if (_radarBlipsLayer == null)
            {
                return;
            }

            _radarBlipsLayer.Clear();
            for (int i = 0; i < MaxRadarBlips; i++)
            {
                var blip = new VisualElement
                {
                    pickingMode = PickingMode.Ignore
                };
                blip.AddToClassList("radar-blip");
                blip.style.position = Position.Absolute;
                blip.style.width = 6;
                blip.style.height = 6;
                blip.style.marginLeft = -3;
                blip.style.marginTop = -3;
                blip.style.borderTopLeftRadius = 3;
                blip.style.borderTopRightRadius = 3;
                blip.style.borderBottomLeftRadius = 3;
                blip.style.borderBottomRightRadius = 3;
                blip.style.display = DisplayStyle.None;
                _radarBlipsLayer.Add(blip);
                _radarBlipPool.Add(blip);
            }
        }

        private void ResolveAndSubscribeSceneReferences()
        {
            if (_catVitals == null)
            {
                _catVitals = FindFirstObjectByType<CatVitals>();
            }
            if (_catVitals != null && !_subscribedVitals)
            {
                _catVitals.OnVitalsChanged += HandleVitalsChanged;
                _catVitals.OnAlbaFainted += HandleAlbaFainted;
                _catVitals.OnVictory += HandleVictory;
                _catVitals.OnZoneChanged += HandleZoneChanged;
                _subscribedVitals = true;
            }

            if (_shiftManager == null)
            {
                _shiftManager = FindFirstObjectByType<DiurnalShiftManager>();
            }
            if (_shiftManager != null && !_subscribedShift)
            {
                _shiftManager.OnShiftUpdated += HandleShiftUpdated;
                _subscribedShift = true;
            }

            if (_kingpinBoss == null)
            {
                _kingpinBoss = FindFirstObjectByType<KingpinBossAI>();
            }
            if (_kingpinBoss != null && !_subscribedKingpin)
            {
                _kingpinBoss.OnBossStateChanged += HandleKingpinStateChanged;
                _subscribedKingpin = true;
            }

            if (_cobaltBoss == null)
            {
                _cobaltBoss = FindFirstObjectByType<LieutenantCobaltBossAI>();
            }
            if (_cobaltBoss != null && !_subscribedCobalt)
            {
                _cobaltBoss.OnBossStateChanged += HandleCobaltStateChanged;
                _subscribedCobalt = true;
            }

            if (_radarController == null)
            {
                _radarController = FindFirstObjectByType<TacticalRadarController>();
            }

            if (_progressBridge == null)
            {
                _progressBridge = FindFirstObjectByType<ShipyardProgressBridge>();
            }
            if (_progressBridge != null && !_subscribedProgress)
            {
                _progressBridge.OnVerminCountsChanged += HandleVerminCountsChanged;
                _subscribedProgress = true;
            }

            if (_missionManager == null)
            {
                _missionManager = MissionManager.Instance;
            }
            if (_missionManager != null && !_subscribedMission)
            {
                _missionManager.OnObjectiveCompleted += HandleObjectiveCompleted;
                _subscribedMission = true;
            }
        }

        private void SubscribeStaticEvents()
        {
            if (_subscribedStatic)
            {
                return;
            }

            CollectibleItem.OnItemCollected += HandleItemCollected;
            PounceTrajectoryVisualizer.OnPouncePromptChanged += HandlePouncePromptChanged;
            ShipbuilderNPC.OnDialogueTriggered += HandleDialogueTriggered;
            ColonyCatNPC.OnColonyDialogue += HandleColonyDialogue;
            _subscribedStatic = true;
        }

        private void UnsubscribeAll()
        {
            if (_catVitals != null && _subscribedVitals)
            {
                _catVitals.OnVitalsChanged -= HandleVitalsChanged;
                _catVitals.OnAlbaFainted -= HandleAlbaFainted;
                _catVitals.OnVictory -= HandleVictory;
                _catVitals.OnZoneChanged -= HandleZoneChanged;
                _subscribedVitals = false;
            }

            if (_shiftManager != null && _subscribedShift)
            {
                _shiftManager.OnShiftUpdated -= HandleShiftUpdated;
                _subscribedShift = false;
            }

            if (_kingpinBoss != null && _subscribedKingpin)
            {
                _kingpinBoss.OnBossStateChanged -= HandleKingpinStateChanged;
                _subscribedKingpin = false;
            }

            if (_cobaltBoss != null && _subscribedCobalt)
            {
                _cobaltBoss.OnBossStateChanged -= HandleCobaltStateChanged;
                _subscribedCobalt = false;
            }

            if (_progressBridge != null && _subscribedProgress)
            {
                _progressBridge.OnVerminCountsChanged -= HandleVerminCountsChanged;
                _subscribedProgress = false;
            }

            if (_missionManager != null && _subscribedMission)
            {
                _missionManager.OnObjectiveCompleted -= HandleObjectiveCompleted;
                _subscribedMission = false;
            }

            if (_subscribedStatic)
            {
                CollectibleItem.OnItemCollected -= HandleItemCollected;
                PounceTrajectoryVisualizer.OnPouncePromptChanged -= HandlePouncePromptChanged;
                ShipbuilderNPC.OnDialogueTriggered -= HandleDialogueTriggered;
                ColonyCatNPC.OnColonyDialogue -= HandleColonyDialogue;
                _subscribedStatic = false;
            }
        }

        private void PerformInitialSync()
        {
            if (_catVitals != null)
            {
                RefreshHUD(_catVitals);
            }

            if (_shiftManager != null)
            {
                HandleShiftUpdated(_shiftManager.CurrentShift, _shiftManager.TimeOfDay);
            }

            if (_progressBridge != null)
            {
                HandleVerminCountsChanged(_progressBridge.ActiveVerminCount, _progressBridge.DefeatedVerminCount);
            }

            RefreshMissionDisplay();
            RefreshLogbook();
        }

        private void UpdateRadar()
        {
            if (_radarController == null || _radarBlipsLayer == null || _radarBlipPool.Count == 0)
            {
                return;
            }

            _radarBlipBuffer.Clear();
            _radarController.GetRadarBlips(_radarBlipBuffer);

            int count = Mathf.Min(_radarBlipBuffer.Count, _radarBlipPool.Count);
            for (int i = 0; i < count; i++)
            {
                RadarBlip data = _radarBlipBuffer[i];
                VisualElement blip = _radarBlipPool[i];

                float xPct = 50f + Mathf.Clamp(data.normalizedOffset.x, -1f, 1f) * 44f;
                float yPct = 50f - Mathf.Clamp(data.normalizedOffset.y, -1f, 1f) * 44f;

                blip.style.left = Length.Percent(xPct);
                blip.style.top = Length.Percent(yPct);
                blip.style.backgroundColor = GetRadarBlipColor(data.kind);
                blip.style.display = DisplayStyle.Flex;
            }

            for (int i = count; i < _activeBlipCount; i++)
            {
                _radarBlipPool[i].style.display = DisplayStyle.None;
            }

            _activeBlipCount = count;
        }

        private static Color GetRadarBlipColor(string kind)
        {
            if (string.IsNullOrEmpty(kind))
            {
                return new Color(0.85f, 0.9f, 1f, 1f);
            }

            if (string.Equals(kind, "boss", StringComparison.OrdinalIgnoreCase))
            {
                return new Color(1f, 0.2f, 0.25f, 1f);
            }

            if (string.Equals(kind, "vermin", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(kind, "rat", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(kind, "enemy", StringComparison.OrdinalIgnoreCase))
            {
                return new Color(1f, 0.55f, 0.15f, 1f);
            }

            if (string.Equals(kind, "collectible", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(kind, "item", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(kind, "loot", StringComparison.OrdinalIgnoreCase))
            {
                return new Color(1f, 0.85f, 0.2f, 1f);
            }

            if (string.Equals(kind, "npc", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(kind, "colony", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(kind, "objective", StringComparison.OrdinalIgnoreCase))
            {
                return new Color(0.3f, 0.95f, 0.55f, 1f);
            }

            return new Color(0.4f, 0.85f, 1f, 1f);
        }

        private void HandleVitalsChanged(CatVitals vitals)
        {
            RefreshHUD(vitals);
        }

        private void HandleAlbaFainted()
        {
            ShowEndgame(false);
        }

        private void HandleVictory()
        {
            ShowEndgame(true);
        }

        private void HandleZoneChanged(ShipyardZone zone)
        {
            if (_zoneLabel != null)
            {
                _zoneLabel.text = zone.ToString().ToUpperInvariant();
            }
        }

        private void HandleShiftUpdated(ShiftPeriod period, float timeOfDay)
        {
            if (_shiftLabel != null && _shiftManager != null)
            {
                _shiftLabel.text = $"{_shiftManager.FormattedShiftName} {_shiftManager.CurrentTimeString}";
            }
            else if (_shiftLabel != null)
            {
                _shiftLabel.text = $"{period}";
            }
        }

        private void HandleKingpinStateChanged(float health, float maxHealth, bool isAggro)
        {
            UpdateBossCard("KINGPIN", health, maxHealth, isAggro);
        }

        private void HandleCobaltStateChanged(float health, float maxHealth, bool isAggro)
        {
            UpdateBossCard("LT. COBALT", health, maxHealth, isAggro);
        }

        private void UpdateBossCard(string bossName, float health, float maxHealth, bool isAggro)
        {
            if (_bossCard == null)
            {
                return;
            }

            bool show = _gameplayHudVisible && isAggro && health > 0f;
            _bossCard.style.display = show ? DisplayStyle.Flex : DisplayStyle.None;
            if (!show)
            {
                return;
            }

            if (_bossNameLabel != null)
            {
                _bossNameLabel.text = bossName;
            }

            float ratio = maxHealth > 0f ? Mathf.Clamp01(health / maxHealth) : 0f;
            if (_bossHealthFill != null)
            {
                _bossHealthFill.style.width = Length.Percent(ratio * 100f);
            }

            if (_bossHealthLabel != null)
            {
                _bossHealthLabel.text = $"{Mathf.CeilToInt(health)} / {Mathf.CeilToInt(maxHealth)}";
            }
        }

        private void HandleVerminCountsChanged(int active, int defeated)
        {
            _lastActiveVermin = active;
            _lastDefeatedVermin = defeated;

            if (_verminLabel != null)
            {
                _verminLabel.text = $"Vermin: {active} (Cleared: {defeated})";
            }

            if (_integrityLabel != null)
            {
                int integrity = Mathf.Clamp(100 - active * 4, 10, 100);
                _integrityLabel.text = $"Integrity: {integrity}%";
            }

            UpdateScoreLabel();
            RefreshMissionDisplay();
        }

        private void HandleObjectiveCompleted(MissionObjective objective)
        {
            RefreshMissionDisplay();
            RefreshLogbook();
            UpdateScoreLabel();
            ShowToast("Objective Completed!");
        }

        private void HandleItemCollected(CollectibleItem item)
        {
            if (item == null)
            {
                return;
            }

            string label = !string.IsNullOrEmpty(item.DisplayName) ? item.DisplayName : item.ItemId;
            ShowToast($"Collected: {label}");
            RefreshMissionDisplay();
        }

        private void HandlePouncePromptChanged(string prompt)
        {
            if (_contextualPromptBar == null || _contextualPromptLabel == null)
            {
                return;
            }

            if (string.IsNullOrEmpty(prompt))
            {
                if (_promptTimer <= 0f)
                {
                    _contextualPromptBar.style.display = DisplayStyle.None;
                }
                return;
            }

            _promptTimer = 0f;
            _contextualPromptLabel.text = prompt;
            _contextualPromptBar.style.display = _gameplayHudVisible ? DisplayStyle.Flex : DisplayStyle.None;
        }

        private void HandleDialogueTriggered(string speaker, string line)
        {
            ShowDialoguePrompt(speaker, line);
        }

        private void HandleColonyDialogue(string speaker, string line)
        {
            ShowDialoguePrompt(speaker, line);
        }

        private void ShowDialoguePrompt(string speaker, string line)
        {
            if (_contextualPromptBar == null || _contextualPromptLabel == null)
            {
                return;
            }

            if (string.IsNullOrEmpty(line))
            {
                return;
            }

            _contextualPromptLabel.text = string.IsNullOrEmpty(speaker) ? line : $"{speaker}: {line}";
            _contextualPromptBar.style.display = DisplayStyle.Flex;
            _promptTimer = DialogueDurationSeconds;
        }

        private void ShowToast(string message)
        {
            if (_toastBanner == null || _toastLabel == null || string.IsNullOrEmpty(message))
            {
                return;
            }

            _toastLabel.text = message;
            _toastBanner.style.display = DisplayStyle.Flex;
            _toastTimer = ToastDurationSeconds;
        }

        private void RefreshMissionDisplay()
        {
            var missionMgr = _missionManager != null ? _missionManager : MissionManager.Instance;
            int completed = missionMgr != null ? missionMgr.CompletedCount : 0;
            int total = missionMgr != null ? missionMgr.TotalCount : 0;

            if (_waveLabel != null)
            {
                _waveLabel.text = $"Act {Mathf.Min(completed + 1, Mathf.Max(1, total))}";
            }

            if (_missionProgress != null)
            {
                _missionProgress.text = total > 0 ? $"{completed}/{total} Objectives" : "Patrol Active";
            }

            string bannerText = _progressBridge != null ? _progressBridge.BuildObjectiveBannerText() : string.Empty;
            if (_objectiveLabel != null)
            {
                _objectiveLabel.text = !string.IsNullOrEmpty(bannerText)
                    ? bannerText
                    : "Explore the Shipyard";
            }

            if (_missionDesc != null)
            {
                var activeObj = missionMgr != null ? missionMgr.GetActiveObjective() : null;
                _missionDesc.text = !string.IsNullOrEmpty(bannerText)
                    ? bannerText
                    : (activeObj != null ? activeObj.ToString() : "Keep the docks clear of vermin.");
            }
        }

        private void UpdateScoreLabel()
        {
            if (_scoreLabel == null)
            {
                return;
            }

            var missionMgr = _missionManager != null ? _missionManager : MissionManager.Instance;
            int completed = missionMgr != null ? missionMgr.CompletedCount : 0;
            int score = _lastRatsCaught * 100 + _lastDefeatedVermin * 50 + completed * 250;
            _scoreLabel.text = $"Score: {score}";
        }

        private void ToggleLogbookOverlay()
        {
            EnsureBound();
            if (_logbookOverlay == null)
            {
                return;
            }

            bool show = _logbookOverlay.style.display != DisplayStyle.Flex;
            _logbookOverlay.style.display = show ? DisplayStyle.Flex : DisplayStyle.None;

            if (show)
            {
                if (_protocolOverlay != null)
                {
                    _protocolOverlay.style.display = DisplayStyle.None;
                }
                RefreshLogbook();
            }
        }

        private void RefreshLogbook()
        {
            var prog = ProgressionSystem.Instance;
            if (_logbookRankLabel != null)
            {
                _logbookRankLabel.text = prog != null
                    ? $"Rank: {prog.CurrentRankTitle} (Lv.{prog.CurrentLevel})"
                    : "Rank: Dockyard Stray";
            }

            if (_logbookXpLabel != null)
            {
                _logbookXpLabel.text = prog != null
                    ? $"XP: {prog.CurrentXP} | Perk Points: {prog.AvailablePerkPoints}"
                    : "XP: 0 | Perk Points: 0";
            }

            if (_logbookActsContainer == null)
            {
                return;
            }

            _logbookActsContainer.Clear();

            var missionMgr = _missionManager != null ? _missionManager : MissionManager.Instance;
            int completed = missionMgr != null ? missionMgr.CompletedCount : 0;
            int total = missionMgr != null ? missionMgr.TotalCount : 0;

            var summary = new Label($"Objectives Completed: {completed}/{total}");
            summary.AddToClassList("logbook-act-entry");
            _logbookActsContainer.Add(summary);

            if (_progressBridge != null)
            {
                string objectiveText = _progressBridge.BuildObjectiveBannerText();
                if (!string.IsNullOrEmpty(objectiveText))
                {
                    var current = new Label($"Current: {objectiveText}");
                    current.AddToClassList("logbook-act-entry");
                    _logbookActsContainer.Add(current);
                }
            }

            var huntStats = new Label($"Rats Caught: {_lastRatsCaught} | Vermin Defeated: {_lastDefeatedVermin}");
            huntStats.AddToClassList("logbook-act-entry");
            _logbookActsContainer.Add(huntStats);
        }

        private void ShowEndgame(bool victory)
        {
            if (_endgameOverlay == null)
            {
                return;
            }

            if (_endgameTitle != null)
            {
                _endgameTitle.text = victory ? "SHIPYARD SECURED" : "ALBA FAINTED";
            }

            if (_endgameSubtitle != null)
            {
                _endgameSubtitle.text = victory
                    ? $"Victory! Rats Caught: {_lastRatsCaught} | Vermin Cleared: {_lastDefeatedVermin}"
                    : $"Rats Caught: {_lastRatsCaught} | Vermin Cleared: {_lastDefeatedVermin}";
            }

            _endgameOverlay.style.display = DisplayStyle.Flex;
        }

        private void HandleNightShiftClicked()
        {
            if (_shiftManager == null)
            {
                _shiftManager = FindFirstObjectByType<DiurnalShiftManager>();
            }

            if (_shiftManager != null)
            {
                _shiftManager.ToggleNightShift();
            }
        }

        private void HandleCloseProtocolClicked()
        {
            SetElementDisplay(_protocolOverlay, DisplayStyle.None);
        }

        private void HandleCloseLogbookClicked()
        {
            SetElementDisplay(_logbookOverlay, DisplayStyle.None);
        }

        private void HandleAgilityPerkClicked()
        {
            TryUnlockTieredPerk("Agility", ref _agilityTier, "Agility");
        }

        private void HandleStealthPerkClicked()
        {
            TryUnlockTieredPerk("Stealth", ref _stealthTier, "Stealth");
        }

        private void HandleCombatPerkClicked()
        {
            TryUnlockTieredPerk("Combat", ref _combatTier, "Combat");
        }

        private void HandleRadPerkClicked()
        {
            TryUnlockTieredPerk("RadResist", ref _radTier, "Rad Resist");
        }

        private void TryUnlockTieredPerk(string prefix, ref int currentTier, string displayName)
        {
            var prog = ProgressionSystem.Instance;
            if (prog == null)
            {
                return;
            }

            for (int tier = currentTier; tier <= 4; tier++)
            {
                if (prog.TryUnlockPerk($"{prefix}_{tier}"))
                {
                    currentTier = tier + 1;
                    ShowToast($"{displayName} Tier {tier} Unlocked!");
                    RefreshLogbook();
                    return;
                }
            }

            ShowToast(prog.AvailablePerkPoints <= 0
                ? "No perk points available."
                : $"{displayName} already at max tier.");
        }

        private void HandleRadarClicked(ClickEvent evt)
        {
            if (_radarController == null)
            {
                _radarController = FindFirstObjectByType<TacticalRadarController>();
            }

            if (_radarController != null)
            {
                _radarController.ToggleFullMap();
            }
        }

        private static void HandleRestartClicked()
        {
            Time.timeScale = 1f;
            Scene activeScene = SceneManager.GetActiveScene();
            SceneManager.LoadScene(activeScene.buildIndex);
        }

        private static void SetElementDisplay(VisualElement element, DisplayStyle display)
        {
            if (element != null)
            {
                element.style.display = display;
            }
        }
    }
}
