#!/usr/bin/env python3
"""Static RUSForma CE/Expansion Market validator. No game process is started."""

from __future__ import annotations

import json
import sys
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WORKSHOP = Path(r"C:\Program Files (x86)\Steam\steamapps\common\DayZ\!Workshop\@RUSForma_vehicles")
SOURCE_XML = WORKSHOP / "info" / "RUSForma_vehicles_types.xml"
CE_XML = ROOT / "mpmissions" / "dayzOffline.chernarusplus" / "dz_mod_ce" / "types_rusforma.xml"
ECONOMY_CORE = ROOT / "mpmissions" / "dayzOffline.chernarusplus" / "cfgeconomycore.xml"
MARKET = ROOT / "profiles" / "ExpansionMod" / "Market"
TRADERS = ROOT / "profiles" / "ExpansionMod" / "Traders"


def fail(message: str) -> None:
    raise AssertionError(message)


def main() -> None:
    source_root = ET.parse(SOURCE_XML).getroot()
    source_vehicle_classes = {
        node.attrib["name"]
        for node in source_root.findall("type")
        if node.find("category") is None
        and node.findtext("nominal") == "0"
        and node.findtext("lifetime") == "3888000"
    }
    if len(source_vehicle_classes) != 242:
        fail(f"Source vehicle class count is {len(source_vehicle_classes)}, expected 242")

    ce_root = ET.parse(CE_XML).getroot()
    ce_nodes = ce_root.findall("type")
    ce_classes = [node.attrib["name"] for node in ce_nodes]
    if len(ce_classes) != 242 or len(set(ce_classes)) != 242:
        fail("CE file must contain exactly 242 unique vehicle classes")
    if set(ce_classes) != source_vehicle_classes:
        fail("CE classes differ from confirmed Workshop vehicle classes")
    for node in ce_nodes:
        for name, expected in (("nominal", "0"), ("min", "0"), ("restock", "0"), ("cost", "100")):
            if node.findtext(name) != expected:
                fail(f"{node.attrib['name']}: {name} != {expected}")

    economy = ET.parse(ECONOMY_CORE).getroot()
    inclusions = [file.attrib.get("name") for file in economy.findall("./ce/file")]
    if inclusions.count("types_rusforma.xml") != 1:
        fail("cfgeconomycore must include types_rusforma.xml exactly once")

    market_files = sorted(MARKET.glob("DeutschZ_RUSForma_*.json"))
    if len(market_files) != 6:
        fail(f"Expected six RUSForma Market categories, found {len(market_files)}")
    market_classes: list[str] = []
    for path in market_files:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
        if data.get("m_Version") != 12:
            fail(f"{path.name}: unsupported Market version")
        market_classes.extend(item["ClassName"] for item in data["Items"])
    duplicates = [name for name, count in Counter(market_classes).items() if count > 1]
    if duplicates:
        fail(f"Duplicate Market classes: {duplicates[:10]}")
    if set(market_classes) != source_vehicle_classes:
        fail("Market classes differ from confirmed Workshop vehicle classes")

    regular = json.loads((TRADERS / "Vehicles.json").read_text(encoding="utf-8-sig"))["Categories"]
    black = json.loads((TRADERS / "Blackmarket_Vehicles.json").read_text(encoding="utf-8-sig"))["Categories"]
    expected_regular = {"DeutschZ_RUSForma_Civilian", "DeutschZ_RUSForma_Utility", "DeutschZ_RUSForma_Offroad"}
    expected_black = {"DeutschZ_RUSForma_Military", "DeutschZ_RUSForma_Armored", "DeutschZ_RUSForma_Special"}
    if not expected_regular.issubset(set(regular)) or expected_regular.intersection(black):
        fail("Regular RUSForma categories are not assigned exclusively to Vehicles.json")
    if not expected_black.issubset(set(black)) or expected_black.intersection(regular):
        fail("Military/Armored/Special categories are not assigned exclusively to Blackmarket_Vehicles.json")

    modlist = (ROOT / "modlist.txt").read_text(encoding="utf-8-sig").strip().split(";")
    if len(modlist) != len(set(modlist)):
        fail("Duplicate entries in modlist.txt")
    if modlist.count("@RUSForma_vehicles") != 1 or modlist[-2:] != ["@RUSForma_vehicles", "@DeutschZ_only_core"]:
        fail("RUSForma/only_core load order is incorrect")

    print("PASS: XML syntax and CE inclusion")
    print("PASS: 242 unique CE vehicle classes, all matched to Workshop source")
    print("PASS: six JSON categories and 242 unique Market classes")
    print("PASS: regular/blackmarket trader assignment")
    print("PASS: modlist uniqueness and load order")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        raise
