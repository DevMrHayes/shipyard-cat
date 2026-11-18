using System;
using UnityEngine;
using ShipyardCat.Player;

namespace ShipyardCat.Core
{
    public interface IDamageable
    {
        bool IsAlive { get; }
        Vector3 Position { get; }
        void TakeDamage(float amount, Vector3 hitSource);
    }

    public enum ShiftPeriod
    {
        FirstShift_Day,
        SecondShift_Dusk,
        ThirdShift_Night
    }

    public enum ShipyardZone
    {
        YardGeneral,
        DryDock12_CVN80,
        DryDock2_SSNVirginia,
        HeavySteelFabShop,
        CatHavenSanctuary,
        DryDock1_KingpinBasin
    }

    /// <summary>
    /// Central runtime registry and objective coordinator for Shipyard Cat.
    /// </summary>
    [DisallowMultipleComponent]
    public class ShipyardGameManager : MonoBehaviour
    {
        public static ShipyardGameManager Instance { get; private set; }

        public Transform PlayerTransform { get; private set; }
        public CatVitals PlayerVitals { get; private set; }
        public string CurrentObjective { get; private set; } = "Patrol Newport News Shipyard, hunt rats, and confront the Kingpin in Dry Dock 1.";

        public event Action<string> OnObjectiveUpdated;

        private GameLoopManager _loopManager;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            _loopManager = FindAnyObjectByType<GameLoopManager>();
        }

        private void OnDestroy()
        {
            if (Instance == this)
                Instance = null;
        }

        public void RegisterPlayer(Transform playerTransform, CatVitals vitals)
        {
            PlayerTransform = playerTransform;
            PlayerVitals = vitals;
        }

        public void UpdateObjective(string objectiveText)
        {
            if (string.IsNullOrEmpty(objectiveText) || CurrentObjective == objectiveText)
                return;

            CurrentObjective = objectiveText;
            OnObjectiveUpdated?.Invoke(CurrentObjective);
        }

        public void RestartMission()
        {
            if (_loopManager == null)
                _loopManager = FindAnyObjectByType<GameLoopManager>();

            if (_loopManager != null)
            {
                _loopManager.RestartGame();
            }
        }
    }
}
