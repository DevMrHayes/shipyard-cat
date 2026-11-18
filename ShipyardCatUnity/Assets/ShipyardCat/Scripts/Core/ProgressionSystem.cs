using System;
using System.Collections.Generic;
using UnityEngine;

namespace ShipyardCat.Core
{
    public enum PerkBranch
    {
        Agility,
        Stealth,
        Combat,
        RadResist
    }

    [Serializable]
    public sealed class RankDefinition
    {
        public int Level;
        public string Title;
        public int XpThreshold;

        public RankDefinition(int level, string title, int xpThreshold)
        {
            Level = level;
            Title = title;
            XpThreshold = xpThreshold;
        }
    }

    [Serializable]
    public sealed class PerkDefinition
    {
        public string Id;
        public string DisplayName;
        public string Description;
        public PerkBranch Branch;
        public int Tier;
        public int Cost;
        public string PrerequisitePerkId;
        public float EffectValue;

        public PerkDefinition(
            string id,
            string displayName,
            string description,
            PerkBranch branch,
            int tier,
            int cost,
            string prerequisitePerkId,
            float effectValue)
        {
            Id = id;
            DisplayName = displayName;
            Description = description;
            Branch = branch;
            Tier = tier;
            Cost = cost;
            PrerequisitePerkId = prerequisitePerkId;
            EffectValue = effectValue;
        }
    }

    public sealed class ProgressionSystem : MonoBehaviour
    {
        public static ProgressionSystem Instance { get; private set; }

        public const int MaxLevel = 8;

        public event Action<int, string> OnLevelUp;
        public event Action<string> OnPerkUnlocked;
        public event Action<int, int> OnXPChanged;

        [SerializeField] private bool persistAcrossScenes = true;

        private readonly List<RankDefinition> _ranks = new List<RankDefinition>(MaxLevel);
        private readonly Dictionary<string, PerkDefinition> _perksById = new Dictionary<string, PerkDefinition>(StringComparer.OrdinalIgnoreCase);
        private readonly List<PerkDefinition> _allPerks = new List<PerkDefinition>(16);
        private readonly HashSet<string> _unlockedPerks = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        private int _currentLevel = 1;
        private int _currentXP = 0;
        private int _availablePerkPoints = 0;

        public int CurrentLevel => _currentLevel;
        public int CurrentXP => _currentXP;
        public int AvailablePerkPoints => _availablePerkPoints;
        public string CurrentRankTitle => GetRankTitle(_currentLevel);
        public IReadOnlyList<RankDefinition> Ranks => _ranks;
        public IReadOnlyList<PerkDefinition> AllPerks => _allPerks;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;

            if (persistAcrossScenes)
            {
                DontDestroyOnLoad(gameObject);
            }

            InitializeRanks();
            InitializePerks();
        }

        private void OnDestroy()
        {
            if (Instance == this)
            {
                Instance = null;
            }
        }

        private void InitializeRanks()
        {
            _ranks.Clear();
            _ranks.Add(new RankDefinition(1, "Stray Kitten", 0));
            _ranks.Add(new RankDefinition(2, "Dockside Mouser", 100));
            _ranks.Add(new RankDefinition(3, "Bilge Runner", 250));
            _ranks.Add(new RankDefinition(4, "Gantry Prowler", 500));
            _ranks.Add(new RankDefinition(5, "Drydock Hunter", 850));
            _ranks.Add(new RankDefinition(6, "Reactor Stalker", 1300));
            _ranks.Add(new RankDefinition(7, "Ironclad Lynx", 1900));
            _ranks.Add(new RankDefinition(8, "Apex Shipyard Cat", 2700));
        }

        private void InitializePerks()
        {
            _allPerks.Clear();
            _perksById.Clear();

            // Agility (4 perks)
            RegisterPerk(new PerkDefinition(
                "Agility_1", "Fleet Paws", "Increases movement speed by 8%.",
                PerkBranch.Agility, 1, 1, null, 0.08f));
            RegisterPerk(new PerkDefinition(
                "Agility_2", "Catwalk Balance", "Increases movement speed by an additional 10%.",
                PerkBranch.Agility, 2, 1, "Agility_1", 0.10f));
            RegisterPerk(new PerkDefinition(
                "Agility_3", "Spring Reflexes", "Increases movement speed by an additional 12%.",
                PerkBranch.Agility, 3, 1, "Agility_2", 0.12f));
            RegisterPerk(new PerkDefinition(
                "Agility_4", "Zero-G Pounce", "Increases movement speed by an additional 15%.",
                PerkBranch.Agility, 4, 1, "Agility_3", 0.15f));

            // Stealth (4 perks)
            RegisterPerk(new PerkDefinition(
                "Stealth_1", "Velvet Pads", "Reduces detection signature by 10%.",
                PerkBranch.Stealth, 1, 1, null, 0.10f));
            RegisterPerk(new PerkDefinition(
                "Stealth_2", "Bulkhead Shadow", "Reduces detection signature by an additional 12%.",
                PerkBranch.Stealth, 2, 1, "Stealth_1", 0.12f));
            RegisterPerk(new PerkDefinition(
                "Stealth_3", "Silent Stalker", "Reduces detection signature by an additional 15%.",
                PerkBranch.Stealth, 3, 1, "Stealth_2", 0.15f));
            RegisterPerk(new PerkDefinition(
                "Stealth_4", "Ghost of the Hull", "Reduces detection signature by an additional 20%.",
                PerkBranch.Stealth, 4, 1, "Stealth_3", 0.20f));

            // Combat (4 perks)
            RegisterPerk(new PerkDefinition(
                "Combat_1", "Sharpened Claws", "Increases combat damage by 10%.",
                PerkBranch.Combat, 1, 1, null, 0.10f));
            RegisterPerk(new PerkDefinition(
                "Combat_2", "Rivet Breaker", "Increases combat damage by an additional 12%.",
                PerkBranch.Combat, 2, 1, "Combat_1", 0.12f));
            RegisterPerk(new PerkDefinition(
                "Combat_3", "Feral Fury", "Increases combat damage by an additional 15%.",
                PerkBranch.Combat, 3, 1, "Combat_2", 0.15f));
            RegisterPerk(new PerkDefinition(
                "Combat_4", "Apex Predator", "Increases combat damage by an additional 20%.",
                PerkBranch.Combat, 4, 1, "Combat_3", 0.20f));

            // RadResist (4 perks)
            RegisterPerk(new PerkDefinition(
                "RadResist_1", "Thick Coat", "Increases radiation resistance multiplier by 15%.",
                PerkBranch.RadResist, 1, 1, null, 0.15f));
            RegisterPerk(new PerkDefinition(
                "RadResist_2", "Lead-Lined Whiskers", "Increases radiation resistance multiplier by an additional 20%.",
                PerkBranch.RadResist, 2, 1, "RadResist_1", 0.20f));
            RegisterPerk(new PerkDefinition(
                "RadResist_3", "Isotope Filter", "Increases radiation resistance multiplier by an additional 25%.",
                PerkBranch.RadResist, 3, 1, "RadResist_2", 0.25f));
            RegisterPerk(new PerkDefinition(
                "RadResist_4", "Core-Hardened", "Increases radiation resistance multiplier by an additional 35%.",
                PerkBranch.RadResist, 4, 1, "RadResist_3", 0.35f));
        }

        private void RegisterPerk(PerkDefinition perk)
        {
            _allPerks.Add(perk);
            _perksById[perk.Id] = perk;
        }

        public void AddXP(int amount)
        {
            if (_ranks.Count == 0)
            {
                InitializeRanks();
                InitializePerks();
            }

            if (amount <= 0)
            {
                return;
            }

            _currentXP += amount;

            while (_currentLevel < MaxLevel)
            {
                RankDefinition nextRank = _ranks[_currentLevel];
                if (_currentXP < nextRank.XpThreshold)
                {
                    break;
                }

                _currentLevel = nextRank.Level;
                _availablePerkPoints += 1;
                OnLevelUp?.Invoke(_currentLevel, nextRank.Title);
            }

            OnXPChanged?.Invoke(_currentXP, GetXPToNextLevel());
        }

        public bool TryUnlockPerk(string perkId)
        {
            if (string.IsNullOrWhiteSpace(perkId))
            {
                return false;
            }

            if (!_perksById.TryGetValue(perkId, out PerkDefinition perk))
            {
                return false;
            }

            if (_unlockedPerks.Contains(perk.Id))
            {
                return false;
            }

            if (_availablePerkPoints < perk.Cost)
            {
                return false;
            }

            if (!string.IsNullOrEmpty(perk.PrerequisitePerkId) && !_unlockedPerks.Contains(perk.PrerequisitePerkId))
            {
                return false;
            }

            _availablePerkPoints -= perk.Cost;
            _unlockedPerks.Add(perk.Id);
            OnPerkUnlocked?.Invoke(perk.Id);
            return true;
        }

        public bool HasPerk(string perkId)
        {
            if (string.IsNullOrWhiteSpace(perkId))
            {
                return false;
            }

            return _unlockedPerks.Contains(perkId);
        }

        public float GetSpeedMultiplier()
        {
            return 1.0f + GetBranchBonus(PerkBranch.Agility);
        }

        public float GetDamageMultiplier()
        {
            return 1.0f + GetBranchBonus(PerkBranch.Combat);
        }

        public float GetRadResistanceMultiplier()
        {
            return 1.0f + GetBranchBonus(PerkBranch.RadResist);
        }

        public float GetStealthMultiplier()
        {
            return Mathf.Max(0.1f, 1.0f - GetBranchBonus(PerkBranch.Stealth));
        }

        public int GetXPToNextLevel()
        {
            if (_currentLevel >= MaxLevel)
            {
                return 0;
            }

            return Mathf.Max(0, _ranks[_currentLevel].XpThreshold - _currentXP);
        }

        public string GetRankTitle(int level)
        {
            int index = Mathf.Clamp(level, 1, MaxLevel) - 1;
            return _ranks[index].Title;
        }

        public List<PerkDefinition> GetPerksByBranch(PerkBranch branch)
        {
            var result = new List<PerkDefinition>(4);
            for (int i = 0; i < _allPerks.Count; i++)
            {
                if (_allPerks[i].Branch == branch)
                {
                    result.Add(_allPerks[i]);
                }
            }
            return result;
        }

        public bool TryGetPerkDefinition(string perkId, out PerkDefinition perk)
        {
            if (string.IsNullOrWhiteSpace(perkId))
            {
                perk = null;
                return false;
            }

            return _perksById.TryGetValue(perkId, out perk);
        }

        private float GetBranchBonus(PerkBranch branch)
        {
            float total = 0f;
            for (int i = 0; i < _allPerks.Count; i++)
            {
                PerkDefinition perk = _allPerks[i];
                if (perk.Branch == branch && _unlockedPerks.Contains(perk.Id))
                {
                    total += perk.EffectValue;
                }
            }
            return total;
        }
    }
}
