using System;
using System.Collections.Generic;
using System.Reflection;
using UnityEngine;
using UnityEngine.AI;
using ShipyardCat.AI;
using ShipyardCat.Player;
using ShipyardCat.World;

namespace ShipyardCat.Core
{
    [DisallowMultipleComponent]
    public class GameLoopManager : MonoBehaviour
    {
        private struct SpawnTransform
        {
            public Vector3 Position;
            public Quaternion Rotation;
        }

        public static GameLoopManager Instance { get; private set; }

        [Header("Spawn & Loop Settings")]
        [SerializeField] private Vector3 albaSpawnPosition = new Vector3(-10f, 0.5f, -20f);
        [SerializeField] private Vector3 albaSpawnEuler = Vector3.zero;
        [SerializeField] private float defaultDayStartHour = 13.5f;
        [SerializeField] private bool pauseOnEndGame = true;

        [Header("Service References (Auto-Resolved if Empty)")]
        [SerializeField] private CatVitals vitals;
        [SerializeField] private AlbaController alba;
        [SerializeField] private DiurnalShiftManager diurnalShift;
        [SerializeField] private KingpinBossAI kingpinBoss;
        [SerializeField] private ShipyardAudioManager audioManager;
        [SerializeField] private ShipyardGameManager gameManager;

        public CatVitals Vitals => vitals;
        public AlbaController Alba => alba;
        public DiurnalShiftManager DiurnalShift => diurnalShift;
        public KingpinBossAI KingpinBoss => kingpinBoss;
        public ShipyardAudioManager AudioManager => audioManager;
        public ShipyardGameManager GameManager => gameManager;

        public bool IsPaused { get; private set; }
        public bool IsGameEnded { get; private set; }

        public event Action OnGameRestarted;
        public event Action<bool> OnPauseStateChanged;

        private readonly Dictionary<RatPreyAI, SpawnTransform> _ratSpawns = new Dictionary<RatPreyAI, SpawnTransform>();
        private SpawnTransform _kingpinSpawn;
        private bool _hasKingpinSpawn;
        private bool _isSubscribed;
        private ShiftPeriod _lastShiftPeriod;
        private bool _hasLastShiftPeriod;

        private static readonly MethodInfo KingpinResetMethod =
            typeof(KingpinBossAI).GetMethod("ResetBoss", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic) ??
            typeof(KingpinBossAI).GetMethod("ResetAI", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);

        private static readonly MethodInfo RatResetMethod =
            typeof(RatPreyAI).GetMethod("ResetRat", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic) ??
            typeof(RatPreyAI).GetMethod("ResetAI", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;
            ResolveServices();
        }

        private void Start()
        {
            ResolveServices();
            CacheInitialActorSpawns();
            SubscribeToEvents();

            if (alba != null && vitals != null && gameManager != null)
            {
                gameManager.RegisterPlayer(alba.transform, vitals);
            }

            if (diurnalShift != null)
            {
                _lastShiftPeriod = diurnalShift.CurrentShift;
                _hasLastShiftPeriod = true;
            }
        }

        private void OnDestroy()
        {
            UnsubscribeFromEvents();

            if (Instance == this)
            {
                Instance = null;
            }
        }

        public void ResolveServices()
        {
            if (alba == null)
            {
                alba = FindAnyObjectByType<AlbaController>(FindObjectsInactive.Include);
            }

            if (vitals == null)
            {
                if (alba != null)
                {
                    vitals = alba.Vitals != null ? alba.Vitals : alba.GetComponent<CatVitals>();
                }

                if (vitals == null)
                {
                    vitals = FindAnyObjectByType<CatVitals>(FindObjectsInactive.Include);
                }
            }

            if (diurnalShift == null)
            {
                diurnalShift = DiurnalShiftManager.Instance != null
                    ? DiurnalShiftManager.Instance
                    : FindAnyObjectByType<DiurnalShiftManager>(FindObjectsInactive.Include);
            }

            if (kingpinBoss == null)
            {
                kingpinBoss = KingpinBossAI.Instance != null
                    ? KingpinBossAI.Instance
                    : FindAnyObjectByType<KingpinBossAI>(FindObjectsInactive.Include);
            }

            if (audioManager == null)
            {
                audioManager = ShipyardAudioManager.Instance != null
                    ? ShipyardAudioManager.Instance
                    : FindAnyObjectByType<ShipyardAudioManager>(FindObjectsInactive.Include);
            }

            if (gameManager == null)
            {
                gameManager = ShipyardGameManager.Instance != null
                    ? ShipyardGameManager.Instance
                    : FindAnyObjectByType<ShipyardGameManager>(FindObjectsInactive.Include);
            }
        }

        public void SetPaused(bool paused)
        {
            IsPaused = paused;
            Time.timeScale = paused ? 0f : 1f;
            OnPauseStateChanged?.Invoke(IsPaused);
        }

        public void TogglePause()
        {
            if (IsGameEnded)
            {
                return;
            }

            SetPaused(!IsPaused);
        }

        public void RestartGame()
        {
            ResolveServices();

            IsGameEnded = false;
            SetPaused(false);

            if (vitals != null)
            {
                vitals.ResetVitals();
            }

            if (alba != null)
            {
                Rigidbody albaRb = alba.GetComponent<Rigidbody>();
                if (albaRb != null && !albaRb.isKinematic)
                {
                    albaRb.linearVelocity = Vector3.zero;
                    albaRb.angularVelocity = Vector3.zero;
                }

                alba.TeleportTo(albaSpawnPosition, Quaternion.Euler(albaSpawnEuler));
            }

            ResetKingpin();
            ResetRats();

            if (diurnalShift != null)
            {
                diurnalShift.SetTimeOfDay(defaultDayStartHour);
                _lastShiftPeriod = diurnalShift.CurrentShift;
                _hasLastShiftPeriod = true;
            }

            if (audioManager != null)
            {
                audioManager.TriggerBossBGM(false);
                bool isNight = diurnalShift != null && diurnalShift.CurrentShift == ShiftPeriod.ThirdShift_Night;
                audioManager.PlayYardBGM(isNight);
            }

            if (gameManager != null)
            {
                if (alba != null && vitals != null)
                {
                    gameManager.RegisterPlayer(alba.transform, vitals);
                }

                gameManager.UpdateObjective("Patrol Newport News Shipyard, hunt rats, and confront the Dry Dock 1 Kingpin.");
            }

            SubscribeToEvents();
            OnGameRestarted?.Invoke();
        }

        private void CacheInitialActorSpawns()
        {
            if (kingpinBoss != null && !_hasKingpinSpawn)
            {
                _kingpinSpawn = new SpawnTransform
                {
                    Position = kingpinBoss.transform.position,
                    Rotation = kingpinBoss.transform.rotation
                };
                _hasKingpinSpawn = true;
            }

            RatPreyAI[] rats = FindObjectsByType<RatPreyAI>(FindObjectsInactive.Include, FindObjectsSortMode.None);
            for (int i = 0; i < rats.Length; i++)
            {
                RatPreyAI rat = rats[i];
                if (rat != null && !_ratSpawns.ContainsKey(rat))
                {
                    _ratSpawns.Add(rat, new SpawnTransform
                    {
                        Position = rat.transform.position,
                        Rotation = rat.transform.rotation
                    });
                }
            }
        }

        private void ResetKingpin()
        {
            if (kingpinBoss == null)
            {
                return;
            }

            if (!kingpinBoss.gameObject.activeSelf)
            {
                kingpinBoss.gameObject.SetActive(true);
            }

            Vector3 spawnPos = _hasKingpinSpawn ? _kingpinSpawn.Position : new Vector3(-45f, -2.0f, 20f);
            Quaternion spawnRot = _hasKingpinSpawn ? _kingpinSpawn.Rotation : Quaternion.identity;

            NavMeshAgent agent = kingpinBoss.GetComponent<NavMeshAgent>();
            if (agent != null && agent.enabled && agent.isOnNavMesh)
            {
                agent.Warp(spawnPos);
                agent.ResetPath();
            }
            else
            {
                kingpinBoss.transform.SetPositionAndRotation(spawnPos, spawnRot);
            }

            kingpinBoss.transform.rotation = spawnRot;

            Rigidbody rb = kingpinBoss.GetComponent<Rigidbody>();
            if (rb != null && !rb.isKinematic)
            {
                rb.linearVelocity = Vector3.zero;
                rb.angularVelocity = Vector3.zero;
            }

            if (KingpinResetMethod != null)
            {
                KingpinResetMethod.Invoke(kingpinBoss, null);
            }
        }

        private void ResetRats()
        {
            RatPreyAI[] activeOrInactiveRats = FindObjectsByType<RatPreyAI>(FindObjectsInactive.Include, FindObjectsSortMode.None);
            for (int i = 0; i < activeOrInactiveRats.Length; i++)
            {
                RatPreyAI rat = activeOrInactiveRats[i];
                if (rat != null && !_ratSpawns.ContainsKey(rat))
                {
                    _ratSpawns.Add(rat, new SpawnTransform
                    {
                        Position = rat.transform.position,
                        Rotation = rat.transform.rotation
                    });
                }
            }

            foreach (KeyValuePair<RatPreyAI, SpawnTransform> entry in _ratSpawns)
            {
                RatPreyAI rat = entry.Key;
                if (rat == null)
                {
                    continue;
                }

                if (!rat.gameObject.activeSelf)
                {
                    rat.gameObject.SetActive(true);
                }

                SpawnTransform spawn = entry.Value;
                NavMeshAgent agent = rat.GetComponent<NavMeshAgent>();
                if (agent != null && agent.enabled && agent.isOnNavMesh)
                {
                    agent.Warp(spawn.Position);
                    agent.ResetPath();
                }
                else
                {
                    rat.transform.SetPositionAndRotation(spawn.Position, spawn.Rotation);
                }

                rat.transform.rotation = spawn.Rotation;

                Rigidbody rb = rat.GetComponent<Rigidbody>();
                if (rb != null && !rb.isKinematic)
                {
                    rb.linearVelocity = Vector3.zero;
                    rb.angularVelocity = Vector3.zero;
                }

                if (RatResetMethod != null)
                {
                    RatResetMethod.Invoke(rat, null);
                }
            }
        }

        private void SubscribeToEvents()
        {
            if (_isSubscribed)
            {
                UnsubscribeFromEvents();
            }

            if (vitals != null)
            {
                vitals.OnAlbaFainted += HandleAlbaFainted;
                vitals.OnVictory += HandleVictory;
            }

            if (alba != null)
            {
                alba.OnToggleNightShiftRequested += HandleToggleNightShiftRequested;
            }

            if (diurnalShift != null)
            {
                diurnalShift.OnShiftUpdated += HandleShiftUpdated;
            }

            if (kingpinBoss != null)
            {
                kingpinBoss.OnBossStateChanged += HandleBossStateChanged;
            }

            _isSubscribed = true;
        }

        private void UnsubscribeFromEvents()
        {
            if (!_isSubscribed)
            {
                return;
            }

            if (vitals != null)
            {
                vitals.OnAlbaFainted -= HandleAlbaFainted;
                vitals.OnVictory -= HandleVictory;
            }

            if (alba != null)
            {
                alba.OnToggleNightShiftRequested -= HandleToggleNightShiftRequested;
            }

            if (diurnalShift != null)
            {
                diurnalShift.OnShiftUpdated -= HandleShiftUpdated;
            }

            if (kingpinBoss != null)
            {
                kingpinBoss.OnBossStateChanged -= HandleBossStateChanged;
            }

            _isSubscribed = false;
        }

        private void HandleAlbaFainted()
        {
            if (IsGameEnded)
            {
                return;
            }

            IsGameEnded = true;
            audioManager?.TriggerBossBGM(false);

            if (pauseOnEndGame)
            {
                SetPaused(true);
            }
        }

        private void HandleVictory()
        {
            if (IsGameEnded)
            {
                return;
            }

            IsGameEnded = true;
            audioManager?.TriggerBossBGM(false);
            audioManager?.PlaySFX("Victory", alba != null ? alba.transform.position : Vector3.zero);

            if (pauseOnEndGame)
            {
                SetPaused(true);
            }
        }

        private void HandleToggleNightShiftRequested()
        {
            if (IsGameEnded || diurnalShift == null)
            {
                return;
            }

            diurnalShift.ToggleNightShift();
        }

        private void HandleShiftUpdated(ShiftPeriod shift, float timeOfDay)
        {
            if (!_hasLastShiftPeriod || _lastShiftPeriod != shift)
            {
                _lastShiftPeriod = shift;
                _hasLastShiftPeriod = true;

                bool bossAggro = kingpinBoss != null && kingpinBoss.IsAggro;
                if (!bossAggro && audioManager != null)
                {
                    audioManager.PlayYardBGM(shift == ShiftPeriod.ThirdShift_Night);
                }
            }
        }

        private void HandleBossStateChanged(float currentHealth, float maxHealth, bool isAggro)
        {
            if (currentHealth <= 0f && vitals != null && !vitals.IsVictorious)
            {
                vitals.TriggerVictory(1000);
                return;
            }

            if (gameManager != null && currentHealth > 0f)
            {
                if (isAggro)
                {
                    gameManager.UpdateObjective("Defeat the Dry Dock 1 Kingpin!");
                }
                else
                {
                    gameManager.UpdateObjective("Patrol Newport News Shipyard, hunt rats, and confront the Dry Dock 1 Kingpin.");
                }
            }
        }
    }
}
