using UnityEngine;

namespace ShipyardCat.Core
{
    /// <summary>
    /// Single-source Art Bible Palette for Shipyard Cat (Newport News Shipbuilding).
    /// Style: Grounded industrial marine realism with high-visibility safety accents.
    /// Mood: Coastal marine haze off the James River; warm sun / sodium vapor floodlights against cool slate shadows.
    /// </summary>
    public static class ShipyardPalette
    {
        // Primary Surfaces
        public static readonly Color CharcoalAsphalt = Hex("#24272A");
        public static readonly Color ConcreteDeck = Hex("#484B4F");
        public static readonly Color SteelHullDark = Hex("#2B3036");
        public static readonly Color SubmarineAnechoic = Hex("#141619");
        public static readonly Color DeepSeaWater = Hex("#003B4D");
        public static readonly Color ChangingSeaFoam = Hex("#509CA2");

        // Atmospheric & Lighting
        public static readonly Color DaySunWarm = Hex("#FFF2DC");
        public static readonly Color NightMoonCool = Hex("#60A5FA");
        public static readonly Color AmbientSkyDay = Hex("#CBD5E1");
        public static readonly Color AmbientEquator = Hex("#475569");
        public static readonly Color AmbientGround = Hex("#1E293B");
        public static readonly Color MarineFogDay = Hex("#131D2E");
        public static readonly Color MarineFogNight = Hex("#020617");

        // High-Vis Safety & Gameplay Accents
        public static readonly Color SafetyAmber = Hex("#F59E0B");
        public static readonly Color SafetyYellow = Hex("#EAB308");
        public static readonly Color SonarCyan = Hex("#06B6D4");
        public static readonly Color ThermalPreyAmber = Hex("#FF9500");
        public static readonly Color KingpinCrimson = Hex("#991B1B");
        public static readonly Color RadiationViolet = Hex("#C026D3");
        public static readonly Color WeldingArcBlue = Hex("#7DF9FF");

        // Feline Character Tones
        public static readonly Color AlbaFurPrimary = Hex("#D97706");
        public static readonly Color AlbaFurBelly = Hex("#FDE68A");
        public static readonly Color AlbaCollar = Hex("#EA580C");

        private static Color Hex(string hex)
        {
            if (ColorUtility.TryParseHtmlString(hex, out Color c))
                return c;
            return Color.magenta;
        }
    }
}
