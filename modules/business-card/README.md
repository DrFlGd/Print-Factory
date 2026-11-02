# Business Card

Business cards to 3D print, in eighteen designs. Type your name, title, company and contact
lines; add a logo (a symbol, your own SVG, or your initials) and a QR code; print one face
or both.

## Designs

- **Clean:** Minimal, Split (a wave of colour holds the name), Window (a round hole right
  through the card), Monogram (initials carved through the skin to a second colour).
- **Shapes:** Swoosh, Orbit, Sash, Dots, Split name (the name changes colour where it crosses
  the slant).
- **Patterns:** Band, Half (a burst from the corner), Framed, Tall (portrait), Logo tile and
  Texture. The pattern can be in colour, carved (tone on tone, you feel it) or cut right
  through as a lattice, at any zoom and angle.
- **QR and NFC:** Corner QR, NFC (a tag inside with a tap mark over it) and Scan back (a big
  code on the back with a label saying what it does).

Every design fits the lettering to its room at one scale, and never below the smallest size
a 0.4 mm nozzle prints: names 3.2 mm, details 2.2 mm capital height. Small text is thickened
a little so its strokes still print. A line that will not fit says so.

## Printing

- **Flush** (the default) prints face down: the front's colours are laid into its first
  layers, so the face is as smooth as the plate (a textured sheet gives it a fine grain).
- **Raised** prints face up with the lettering standing 0.2 to 1.2 mm proud.
- **Two-sided** cards lay the back into the other face's layers. Both faces' colours share
  layers, so they need an AMS or another multi-material printer. A raised one-sided card with
  no colour fields needs only one filament swap, at the height in the notes.
- Every height is a whole number of 0.2 mm layers. The card grows thicker when it needs to
  (two faces of colour, or a tag inside), and the notes say so.

## QR code

Opens your website, saves your contact (a vCard: a bigger code), or any link. Four styles:
square, rounded, dots and round corners. Modules are at least 0.7 mm (0.85 for dots); Large
makes them 30 % bigger. "Logo in the middle" switches to the strongest error correction and
leaves the centre clear for the mark. A light code on a dark card is printed as a light tile
with the modules left open, since phones read dark modules on a light ground; colours too
close to scan are flagged.

## NFC

Tick NFC (or pick the NFC design) for a pocket between the faces for a 25 or 30 mm sticker or
a 25 mm coin. The notes give the pause height: the printer stops, you press the tag in, and it
prints over it. The pocket keeps clear of windows and cut patterns.

## Preview

Next to the card as it prints is the other side up, so both faces can be checked.
