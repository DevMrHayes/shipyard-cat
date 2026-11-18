using UnityEngine;

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
}
