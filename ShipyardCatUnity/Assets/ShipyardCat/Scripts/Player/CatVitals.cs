using System;
using UnityEngine;
using ShipyardCat.Core;

namespace ShipyardCat.Player
{
    [DisallowMultipleComponent]
    public class CatVitals : MonoBehaviour
    {
        [Header("Capacity")]
        public float MaxHealth = 100f;
        public float MaxStamina = 100f;
        public float MaxRadiation = 100f;

        public float Health { get; private set; }
        public float Stamina { get; private set; }
        public float Radiation { get; private set; }
        public int RatsCaught { get; private set; }
        public int Score { get; private set; }
        public bool IsFainted { get; private set; }
        public bool IsVictorious { get; private set; }
        public ShipyardZone CurrentZone { get; private set; } = ShipyardZone.YardGeneral;

        public event Action<CatVitals> OnVitalsChanged;
        public event Action OnAlbaFainted;
        public event Action OnVictory;
        public event Action<ShipyardZone> OnZoneChanged;

        private void Awake()
        {
            ResetVitals();
        }

        public void ResetVitals()
        {
            Health = MaxHealth;
            Stamina = MaxStamina;
            Radiation = 0f;
            RatsCaught = 0;
            Score = 0;
            IsFainted = false;
            IsVictorious = false;
            CurrentZone = ShipyardZone.YardGeneral;
            OnVitalsChanged?.Invoke(this);
            OnZoneChanged?.Invoke(CurrentZone);
        }

        public void ModifyHealth(float delta)
        {
            if (IsFainted || IsVictorious) return;
            Health = Mathf.Clamp(Health + delta, 0f, MaxHealth);
            if (Health <= 0f && !IsFainted)
            {
                IsFainted = true;
                OnVitalsChanged?.Invoke(this);
                OnAlbaFainted?.Invoke();
                return;
            }
            OnVitalsChanged?.Invoke(this);
        }

        public void TakeDamage(float amount) => ModifyHealth(-Mathf.Abs(amount));

        public void HealFull()
        {
            Health = MaxHealth;
            Stamina = MaxStamina;
            Radiation = 0f;
            IsFainted = false;
            OnVitalsChanged?.Invoke(this);
        }

        public bool TryConsumeStamina(float amount)
        {
            if (IsFainted || IsVictorious || Stamina < amount) return false;
            Stamina = Mathf.Max(0f, Stamina - amount);
            OnVitalsChanged?.Invoke(this);
            return true;
        }

        public void RegenerateStamina(float ratePerSec, float dt)
        {
            if (IsFainted || IsVictorious || Stamina >= MaxStamina) return;
            Stamina = Mathf.Min(MaxStamina, Stamina + ratePerSec * dt);
            OnVitalsChanged?.Invoke(this);
        }

        public void AddRadiation(float delta)
        {
            if (IsFainted || IsVictorious) return;
            Radiation = Mathf.Clamp(Radiation + delta, 0f, MaxRadiation);
            if (Radiation >= MaxRadiation)
            {
                ModifyHealth(-12f * Time.deltaTime);
            }
            else
            {
                OnVitalsChanged?.Invoke(this);
            }
        }

        public void RegisterRatCaught(int scoreValue = 100)
        {
            RatsCaught++;
            Score += Mathf.Max(0, scoreValue);
            Stamina = Mathf.Min(MaxStamina, Stamina + 30f);
            Health = Mathf.Min(MaxHealth, Health + 10f);
            OnVitalsChanged?.Invoke(this);
        }

        public void TriggerVictory(int bonusScore = 1000)
        {
            if (IsVictorious || IsFainted) return;
            IsVictorious = true;
            Score += Mathf.Max(0, bonusScore);
            OnVitalsChanged?.Invoke(this);
            OnVictory?.Invoke();
        }

        public void SetZone(ShipyardZone zone)
        {
            if (CurrentZone == zone) return;
            CurrentZone = zone;
            OnZoneChanged?.Invoke(zone);
            OnVitalsChanged?.Invoke(this);
        }
    }
}
