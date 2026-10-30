/* @ds-bundle: {"format":4,"namespace":"SommeasyDesignSystem_0c6415","components":[{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Chip","sourcePath":"components/core/Chip.jsx"},{"name":"SectionLabel","sourcePath":"components/core/SectionLabel.jsx"},{"name":"Toast","sourcePath":"components/core/Toast.jsx"},{"name":"BuildingBar","sourcePath":"components/feedback/BuildingBar.jsx"},{"name":"PromptCard","sourcePath":"components/feedback/PromptCard.jsx"},{"name":"RatingModal","sourcePath":"components/feedback/RatingModal.jsx"},{"name":"TextField","sourcePath":"components/forms/TextField.jsx"},{"name":"AppHeader","sourcePath":"components/layout/AppHeader.jsx"},{"name":"HeroPanel","sourcePath":"components/layout/HeroPanel.jsx"},{"name":"StepCard","sourcePath":"components/layout/StepCard.jsx"},{"name":"MARK_PALETTE","sourcePath":"components/wine/PalateMark.jsx"},{"name":"MARK_GEOMETRY","sourcePath":"components/wine/PalateMark.jsx"},{"name":"PalateMark","sourcePath":"components/wine/PalateMark.jsx"},{"name":"SignatureRail","sourcePath":"components/wine/SignatureRail.jsx"},{"name":"WineRecCard","sourcePath":"components/wine/WineRecCard.jsx"}],"sourceHashes":{"components/core/Button.jsx":"52a97ee73987","components/core/Card.jsx":"047acbdb2f7e","components/core/Chip.jsx":"979bb362907a","components/core/SectionLabel.jsx":"88df0d968935","components/core/Toast.jsx":"470175191cf5","components/feedback/BuildingBar.jsx":"c2f4fa912ad4","components/feedback/PromptCard.jsx":"775a5d09db2e","components/feedback/RatingModal.jsx":"d1ad5ce55c5f","components/forms/TextField.jsx":"0ab8184576e0","components/layout/AppHeader.jsx":"0a1be27e2f0b","components/layout/HeroPanel.jsx":"5c71a774cc65","components/layout/StepCard.jsx":"b9f6bc3bae38","components/wine/PalateMark.jsx":"70c7a5e47683","components/wine/SignatureRail.jsx":"5b4438f5d59d","components/wine/WineRecCard.jsx":"5f7c29859261","doc-page.js":"371bab66f42d","ui_kits/sommeasy/AuthScreen.jsx":"7871c722bfb5","ui_kits/sommeasy/HomeScreen.jsx":"302cc06b9caa","ui_kits/sommeasy/JournalScreen.jsx":"cbf5536e7d2e","ui_kits/sommeasy/PalateScreen.jsx":"cd47b098a61a","ui_kits/sommeasy/RecommendScreen.jsx":"84a565cf4ddb","ui_kits/sommeasy/WelcomeScreen.jsx":"4897d40d4481","ui_kits/sommeasy/app.jsx":"f8ee958ae204","ui_kits/sommeasy/data.jsx":"0541fc4c0cf8"},"inlinedExternals":[],"unexposedExports":[{"name":"markParams","sourcePath":"components/wine/PalateMark.jsx"},{"name":"normalizeGenome","sourcePath":"components/wine/PalateMark.jsx"},{"name":"renderPalateMark","sourcePath":"components/wine/PalateMark.jsx"}]} */

(() => {

const __ds_ns = (window.SommeasyDesignSystem_0c6415 = window.SommeasyDesignSystem_0c6415 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SANS = "'Source Sans 3', sans-serif";
const V = {
  primary: {
    border: "none",
    background: "linear-gradient(135deg, #8B2332, #7A1E2C)",
    color: "#F5F0E8",
    fontWeight: 600,
    boxShadow: "0 6px 20px rgba(139,35,50,0.25)"
  },
  secondary: {
    border: "1px solid rgba(139,35,50,0.12)",
    background: "rgba(139,35,50,0.04)",
    color: "#8B2332",
    fontWeight: 600,
    boxShadow: "none"
  },
  ghost: {
    border: "1px solid rgba(27,61,47,0.1)",
    background: "rgba(27,61,47,0.03)",
    color: "#1B3D2F",
    fontWeight: 500,
    boxShadow: "none"
  },
  text: {
    border: "none",
    background: "none",
    color: "#1B3D2F",
    fontWeight: 500,
    boxShadow: "none",
    opacity: 0.4
  }
};
const S = {
  sm: {
    padding: "9px 14px",
    fontSize: "12px",
    borderRadius: "10px"
  },
  md: {
    padding: "10px 20px",
    fontSize: "13px",
    borderRadius: "100px"
  },
  lg: {
    padding: "16px 24px",
    fontSize: "15px",
    borderRadius: "14px"
  }
};
/** Sommeasy button. variant: primary (burgundy gradient) | secondary (burgundy tint) | ghost (green hairline) | text. size sm|md|lg; pill forces 100px radius (welcome CTA: pill lg). */
function Button({
  variant = "primary",
  size = "md",
  pill,
  fullWidth,
  disabled,
  icon,
  children,
  style,
  ...rest
}) {
  const v = V[variant] || V.primary;
  const s = S[size] || S.md;
  return /*#__PURE__*/React.createElement("button", _extends({
    disabled: disabled,
    style: {
      fontFamily: SANS,
      cursor: disabled ? "not-allowed" : "pointer",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "6px",
      minHeight: 40,
      transition: "all 0.15s ease",
      textAlign: "center",
      ...v,
      ...s,
      ...(pill ? {
        borderRadius: "100px"
      } : {}),
      ...(size === "lg" && pill ? {
        padding: "17px 52px",
        fontSize: "16px",
        letterSpacing: "0.03em",
        boxShadow: variant === "primary" ? "0 6px 24px rgba(139,35,50,0.3), 0 2px 6px rgba(139,35,50,0.15)" : v.boxShadow
      } : {}),
      ...(fullWidth ? {
        width: "100%"
      } : {}),
      ...(disabled && variant === "primary" ? {
        background: "rgba(139,35,50,0.4)",
        boxShadow: "none"
      } : {}),
      ...style
    }
  }, rest), icon && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "16px"
    }
  }, icon), children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const LEVELS = {
  quiet: "rgba(255,255,255,0.4)",
  standard: "rgba(255,255,255,0.5)",
  strong: "rgba(255,255,255,0.55)"
};
const RADII = {
  xl: "16px",
  "2xl": "18px",
  "3xl": "24px"
};
/** Translucent white card over cream. level quiet|standard|strong; radius xl (cards) | 2xl (modules) | 3xl (hero/modal); accent draws the 3px left border (burgundy = ask, sage = onboarding). */
function Card({
  level = "standard",
  radius = "xl",
  accent,
  padding = "18px 20px",
  children,
  style,
  ...rest
}) {
  const accentColor = accent === "burgundy" ? "#8B2332" : accent === "sage" ? "#6B8F5E" : null;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: accent === "burgundy" ? "#F5F0E8" : LEVELS[level] || LEVELS.standard,
      borderRadius: accent ? "14px" : RADII[radius] || RADII.xl,
      border: accent === "burgundy" ? "1px solid rgba(139,35,50,0.12)" : "1px solid rgba(27,61,47,0.06)",
      ...(accentColor ? {
        borderLeft: `3px solid ${accentColor}`
      } : {}),
      padding,
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Chip.jsx
try { (() => {
/** DNA chip — pill tag for countries/regions/grapes/estates. earned shows the burgundy ✦ ("earned by your ratings, not the quiz"). */
function Chip({
  label,
  earned,
  children
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "'Source Sans 3', sans-serif",
      fontSize: "13px",
      color: "#1B3D2F",
      background: "rgba(27,61,47,0.05)",
      padding: "5px 14px",
      borderRadius: "100px",
      display: "inline-block"
    }
  }, label ?? children, earned && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "#8B2332",
      marginLeft: 5,
      fontSize: "11px"
    }
  }, "\u2726"));
}
Object.assign(__ds_scope, { Chip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Chip.jsx", error: String((e && e.message) || e) }); }

// components/core/SectionLabel.jsx
try { (() => {
/** Uppercase tracked section label — the brand's smallest voice. tone: ink (green, 0.35) | accent (burgundy, full). */
function SectionLabel({
  tone = "ink",
  tracking = "0.12em",
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Source Sans 3', sans-serif",
      fontSize: "11px",
      fontWeight: tone === "accent" ? 700 : 600,
      textTransform: "uppercase",
      letterSpacing: tracking,
      color: tone === "accent" ? "#8B2332" : "#1B3D2F",
      opacity: tone === "accent" ? 1 : 0.35,
      marginBottom: 12,
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { SectionLabel });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/SectionLabel.jsx", error: String((e && e.message) || e) }); }

// components/core/Toast.jsx
try { (() => {
/** Forest-green pill toast. fixed pins it top-center (production behavior); check prefixes ✓. */
function Toast({
  children,
  check,
  fixed,
  top = 16
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      ...(fixed ? {
        position: "fixed",
        top,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 90
      } : {
        display: "inline-block"
      }),
      background: "#1B3D2F",
      color: "#F5F0E8",
      padding: "10px 24px",
      borderRadius: "100px",
      fontFamily: "'Source Sans 3', sans-serif",
      fontSize: "14px",
      fontWeight: 600,
      whiteSpace: "nowrap",
      boxShadow: "0 4px 20px rgba(27,61,47,0.3)"
    }
  }, check && "✓ ", children);
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Toast.jsx", error: String((e && e.message) || e) }); }

// components/feedback/BuildingBar.jsx
try { (() => {
const SANS = "'Source Sans 3', sans-serif";
/** "Building now" progress row: name + dimension tag, "N loved bottles away", 5px sage bar. ratio 0–1; animate via mounted. */
function BuildingBar({
  name,
  dimension,
  away,
  ratio = 0,
  mounted = true,
  delay = 0
}) {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: "10px",
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: SANS,
      fontSize: "14px",
      fontWeight: 600,
      color: "#1B3D2F"
    }
  }, name, dimension && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "10px",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.1em",
      opacity: 0.35,
      marginLeft: 8
    }
  }, dimension)), away && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: SANS,
      fontSize: "12px",
      color: "#8B2332",
      opacity: 0.75,
      flexShrink: 0
    }
  }, away)), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 5,
      borderRadius: 3,
      background: "rgba(27,61,47,0.08)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      borderRadius: 3,
      background: "#6B8F5E",
      width: mounted ? `${Math.max(5, Math.round(Math.min(1, ratio) * 100))}%` : "0%",
      transition: `width 0.9s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`
    }
  })));
}
Object.assign(__ds_scope, { BuildingBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/BuildingBar.jsx", error: String((e && e.message) || e) }); }

// components/feedback/PromptCard.jsx
try { (() => {
const SANS = "'Source Sans 3', sans-serif";
const SERIF = "'Playfair Display', Georgia, serif";
/** Prompt band card: accent "burgundy" = the table-verdict ask (cream, eyebrow, serif question); accent "sage" = first-pour teaching card (white, serif title, dismissable). Exactly one prompt band at a time. */
function PromptCard({
  accent = "sage",
  eyebrow,
  title,
  body,
  actions,
  onDismiss,
  style
}) {
  const burgundy = accent === "burgundy";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      padding: "16px 20px",
      borderRadius: "14px",
      background: burgundy ? "#F5F0E8" : "rgba(255,255,255,0.55)",
      border: burgundy ? "1px solid rgba(139,35,50,0.12)" : "1px solid rgba(27,61,47,0.08)",
      borderLeft: `3px solid ${burgundy ? "#8B2332" : "#6B8F5E"}`,
      ...style
    }
  }, onDismiss && /*#__PURE__*/React.createElement("button", {
    "aria-label": "Not now",
    onClick: onDismiss,
    style: {
      position: "absolute",
      top: 4,
      right: 4,
      width: 40,
      height: 40,
      background: "none",
      border: "none",
      cursor: "pointer",
      fontFamily: SANS,
      fontSize: "18px",
      color: "#1B3D2F",
      opacity: 0.3,
      lineHeight: 1
    }
  }, "\xD7"), eyebrow && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: SANS,
      fontSize: "11px",
      fontWeight: 700,
      color: "#8B2332",
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      marginBottom: 6
    }
  }, eyebrow), title && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: SERIF,
      fontSize: "16px",
      color: "#1B3D2F",
      fontWeight: burgundy ? 400 : 600,
      lineHeight: 1.35,
      margin: onDismiss ? "0 28px 6px 0" : "0 0 6px"
    }
  }, title), body && /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: SANS,
      fontSize: "13px",
      color: "#1B3D2F",
      opacity: 0.6,
      lineHeight: 1.5,
      margin: "0 0 12px"
    }
  }, body), actions && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "8px"
    }
  }, actions));
}
Object.assign(__ds_scope, { PromptCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/PromptCard.jsx", error: String((e && e.message) || e) }); }

// components/feedback/RatingModal.jsx
try { (() => {
const SANS = "'Source Sans 3', sans-serif";
const SERIF = "'Playfair Display', Georgia, serif";
const RATINGS = [{
  id: "loved",
  emoji: "❤️",
  label: "Loved it"
}, {
  id: "liked",
  emoji: "👍",
  label: "Liked it"
}, {
  id: "fine",
  emoji: "😐",
  label: "It was fine"
}, {
  id: "not_for_me",
  emoji: "👎",
  label: "Not for me"
}];
/** THE rating modal — the one "how was it?" surface. Green blurred scrim, cream 24px panel, four emoji rating rows. */
function RatingModal({
  wine,
  onRate,
  onClose,
  eyebrow = "You've had this wine"
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      zIndex: 100,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(27,61,47,0.4)",
      backdropFilter: "blur(8px)",
      padding: 24
    },
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: "#F5F0E8",
      borderRadius: "24px",
      padding: "28px 24px",
      maxWidth: 360,
      width: "100%",
      boxShadow: "0 24px 64px rgba(0,0,0,0.2)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: SANS,
      fontSize: "11px",
      textTransform: "uppercase",
      letterSpacing: "0.15em",
      color: "#1B3D2F",
      opacity: 0.4,
      marginBottom: 8,
      fontWeight: 600
    }
  }, eyebrow), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: SERIF,
      fontSize: "18px",
      color: "#1B3D2F",
      lineHeight: 1.3,
      marginBottom: 24
    }
  }, wine), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "8px"
    }
  }, RATINGS.map(r => /*#__PURE__*/React.createElement("button", {
    key: r.id,
    onClick: () => onRate && onRate(r.id),
    style: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      padding: "14px 18px",
      borderRadius: "14px",
      border: "1px solid rgba(27,61,47,0.08)",
      background: "rgba(255,255,255,0.5)",
      cursor: "pointer",
      transition: "all 0.15s ease",
      fontFamily: SANS,
      fontSize: "15px",
      color: "#1B3D2F",
      fontWeight: 500,
      width: "100%",
      textAlign: "left"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "20px"
    }
  }, r.emoji), r.label))), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      marginTop: 16,
      width: "100%",
      padding: "10px",
      fontFamily: SANS,
      fontSize: "13px",
      color: "#1B3D2F",
      opacity: 0.4,
      background: "none",
      border: "none",
      cursor: "pointer"
    }
  }, "Cancel")));
}
Object.assign(__ds_scope, { RatingModal });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/RatingModal.jsx", error: String((e && e.message) || e) }); }

// components/forms/TextField.jsx
try { (() => {
const {
  useState
} = React;
const SANS = "'Source Sans 3', sans-serif";
/** The AuthField pattern: visible tracked label, 14px-radius translucent input, focus ring, helper line, Show/Hide on passwords. Inputs stay 16px (iOS zoom). */
function TextField({
  id,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  helper,
  autoComplete,
  inputMode,
  autoFocus,
  required = true,
  minLength,
  style
}) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const focus = e => {
    e.target.style.borderColor = "rgba(139,35,50,0.3)";
    e.target.style.boxShadow = "0 0 0 3px rgba(139,35,50,0.06)";
  };
  const blur = e => {
    e.target.style.borderColor = "rgba(27,61,47,0.1)";
    e.target.style.boxShadow = "none";
  };
  return /*#__PURE__*/React.createElement("div", {
    style: style
  }, /*#__PURE__*/React.createElement("label", {
    htmlFor: id,
    style: {
      display: "block",
      fontFamily: SANS,
      fontSize: "11px",
      fontWeight: 600,
      color: "#1B3D2F",
      opacity: 0.55,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      margin: "0 0 6px 4px"
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("input", {
    id: id,
    name: id,
    type: isPassword && show ? "text" : type,
    value: value,
    onChange: onChange,
    autoComplete: autoComplete,
    inputMode: inputMode,
    autoFocus: autoFocus,
    required: required,
    minLength: minLength,
    placeholder: placeholder,
    onFocus: focus,
    onBlur: blur,
    style: {
      width: "100%",
      padding: "15px 18px",
      borderRadius: "14px",
      border: "1px solid rgba(27,61,47,0.1)",
      background: "rgba(255,255,255,0.55)",
      fontFamily: SANS,
      fontSize: "16px",
      color: "#1B3D2F",
      outline: "none",
      boxSizing: "border-box",
      transition: "border-color 0.2s ease, box-shadow 0.2s ease",
      ...(isPassword ? {
        paddingRight: 74
      } : {})
    }
  }), isPassword && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setShow(s => !s),
    "aria-label": show ? "Hide password" : "Show password",
    style: {
      position: "absolute",
      right: 6,
      top: "50%",
      transform: "translateY(-50%)",
      border: "none",
      background: "none",
      cursor: "pointer",
      padding: "12px 12px",
      color: "#8B2332",
      fontFamily: SANS,
      fontSize: "13px",
      fontWeight: 600
    }
  }, show ? "Hide" : "Show")), helper && /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: SANS,
      fontSize: "12px",
      color: "#1B3D2F",
      opacity: 0.45,
      margin: "6px 4px 0",
      lineHeight: 1.4
    }
  }, helper));
}
Object.assign(__ds_scope, { TextField });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/TextField.jsx", error: String((e && e.message) || e) }); }

// components/layout/AppHeader.jsx
try { (() => {
const SANS = "'Source Sans 3', sans-serif";
const SERIF = "'Playfair Display', Georgia, serif";
/** Sticky app header: protea icon + burgundy serif wordmark, right slot for user email + Sign Out pill. assetBase points at the design-system assets folder. */
function AppHeader({
  userName,
  onSignOut,
  sticky = true,
  assetBase = "../../assets",
  right
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      padding: "20px 0 16px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      ...(sticky ? {
        position: "sticky",
        top: 0,
        background: "rgba(245,240,232,0.92)",
        backdropFilter: "blur(16px)",
        zIndex: 10
      } : {})
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "10px"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: `${assetBase}/protea-icon.png`,
    alt: "",
    style: {
      height: 36,
      width: "auto"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: SERIF,
      fontSize: "22px",
      color: "#8B2332",
      fontWeight: 700,
      letterSpacing: "-0.01em"
    }
  }, "Sommeasy")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "14px"
    }
  }, userName && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: SANS,
      fontSize: "13px",
      color: "#1B3D2F",
      opacity: 0.45
    }
  }, userName), right, onSignOut && /*#__PURE__*/React.createElement("button", {
    onClick: onSignOut,
    style: {
      fontFamily: SANS,
      fontSize: "12px",
      color: "#1B3D2F",
      background: "none",
      border: "1px solid rgba(27,61,47,0.12)",
      borderRadius: "100px",
      padding: "5px 14px",
      cursor: "pointer",
      opacity: 0.45
    }
  }, "Sign Out")));
}
Object.assign(__ds_scope, { AppHeader });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/layout/AppHeader.jsx", error: String((e && e.message) || e) }); }

// components/layout/HeroPanel.jsx
try { (() => {
const SANS = "'Source Sans 3', sans-serif";
const SERIF = "'Playfair Display', Georgia, serif";
/** Dark gradient panel: tone "burgundy" (restaurant CTA, decorative circles, capsule) or "forest" (DNA strip). Composes eyebrow/title/body/capsule or fully custom children. */
function HeroPanel({
  tone = "burgundy",
  eyebrow,
  title,
  body,
  capsule,
  capsuleIcon,
  children,
  href,
  style
}) {
  const burgundy = tone === "burgundy";
  const Tag = href ? "a" : "div";
  return /*#__PURE__*/React.createElement(Tag, {
    href: href,
    style: {
      display: "block",
      textDecoration: "none",
      position: "relative",
      overflow: "hidden",
      color: "#F5F0E8",
      background: burgundy ? "linear-gradient(155deg, #8B2332 0%, #7A1E2C 40%, #5C1620 100%)" : "linear-gradient(155deg, #1B3D2F 0%, #234A38 40%, #1B3D2F 100%)",
      borderRadius: burgundy ? "24px" : "18px",
      padding: burgundy ? "36px 32px 32px" : "20px 24px",
      boxShadow: burgundy ? "0 12px 40px rgba(139,35,50,0.3), 0 2px 8px rgba(139,35,50,0.15)" : "0 6px 24px rgba(27,61,47,0.2), 0 2px 6px rgba(27,61,47,0.1)",
      ...style
    }
  }, burgundy && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: -30,
      right: -30,
      width: 120,
      height: 120,
      borderRadius: "50%",
      background: "rgba(255,255,255,0.05)"
    }
  }), burgundy && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      bottom: -40,
      left: 20,
      width: 100,
      height: 100,
      borderRadius: "50%",
      background: "rgba(255,255,255,0.03)"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative"
    }
  }, eyebrow && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: SANS,
      fontSize: "11px",
      letterSpacing: "0.22em",
      textTransform: "uppercase",
      opacity: 0.45,
      marginBottom: 12,
      fontWeight: 500
    }
  }, eyebrow), title && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: SERIF,
      fontSize: burgundy ? "30px" : "20px",
      fontWeight: 700,
      lineHeight: burgundy ? 1.15 : 1.2,
      marginBottom: body ? 12 : 0,
      letterSpacing: "-0.01em"
    }
  }, title), body && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: SANS,
      fontSize: "16px",
      opacity: 0.65,
      lineHeight: 1.55,
      maxWidth: 300
    }
  }, body), capsule && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 24,
      display: "inline-flex",
      alignItems: "center",
      gap: "10px",
      background: "rgba(255,255,255,0.13)",
      borderRadius: "100px",
      padding: "11px 26px",
      fontFamily: SANS,
      fontSize: "14px",
      fontWeight: 600,
      border: "1px solid rgba(255,255,255,0.08)"
    }
  }, capsuleIcon && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "16px"
    }
  }, capsuleIcon), " ", capsule), children));
}
Object.assign(__ds_scope, { HeroPanel });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/layout/HeroPanel.jsx", error: String((e && e.message) || e) }); }

// components/layout/StepCard.jsx
try { (() => {
const SANS = "'Source Sans 3', sans-serif";
const SERIF = "'Playfair Display', Georgia, serif";
/** How-it-works row: burgundy-gradient numbered circle + serif title + quiet body, on a standard card. */
function StepCard({
  n,
  title,
  body
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: "16px",
      background: "rgba(255,255,255,0.5)",
      borderRadius: "16px",
      padding: "18px 20px",
      border: "1px solid rgba(27,61,47,0.06)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 28,
      height: 28,
      borderRadius: "50%",
      background: "linear-gradient(135deg, #8B2332, #7A1E2C)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#F5F0E8",
      fontFamily: SERIF,
      fontSize: "13px",
      fontWeight: 700,
      flexShrink: 0,
      marginTop: 1,
      boxShadow: "0 2px 8px rgba(139,35,50,0.25)"
    }
  }, n), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: SERIF,
      fontSize: "16px",
      color: "#1B3D2F",
      fontWeight: 600,
      lineHeight: 1.3,
      marginBottom: 4
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: SANS,
      fontSize: "14px",
      color: "#1B3D2F",
      opacity: 0.55,
      lineHeight: 1.5
    }
  }, body)));
}
Object.assign(__ds_scope, { StepCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/layout/StepCard.jsx", error: String((e && e.message) || e) }); }

// components/wine/PalateMark.jsx
try { (() => {
// Verbatim recreation of src/lib/palateMark.js — the generative "bloom on a medallion" DNA signature. Byte-deterministic: same genome → same SVG.
const MARK_PALETTE = {
  disc: "#1B3D2F",
  petal: "#2A5540",
  line: "#C9DAC4",
  sage: "#6B8F5E",
  cream: "#F5F0E8",
  burgundy: "#8B2332"
};
const MARK_GEOMETRY = {
  view: 160,
  discR: 74,
  frameOuterR: 71,
  frameInnerR: 67.5,
  orbitR: 56,
  orbitDash: "0.2 5.8",
  petalBaseR: 24,
  petalTipMinR: 47,
  petalTipMaxR: 66,
  petalMinCount: 5,
  petalExtraCount: 4,
  petalWidthFactor: 0.36,
  petalWidthCapDeg: 18,
  petalShoulder: 0.65,
  tipBulgeMin: 0.8,
  tipBulgeMax: 5,
  stamenBaseR: 22,
  stamenTipMinR: 34,
  stamenTipMaxR: 60,
  ringR: 18.5,
  ringWidth: 4.2,
  ringGapDeg: 8,
  ringSliverDeg: 10,
  berryMax: 6,
  berryR: 2.4,
  coreR: 6.5
};
function mulberry32(a) {
  let s = a >>> 0;
  return function () {
    s = s + 0x6d2b79f5 >>> 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function fmt(n) {
  const r = Math.round(n * 100) / 100;
  return String(r === 0 ? 0 : r);
}
function polar(r, deg) {
  const rad = deg * Math.PI / 180;
  return [80 + r * Math.cos(rad), 80 + r * Math.sin(rad)];
}
function pt(r, deg) {
  const [x, y] = polar(r, deg);
  return `${fmt(x)} ${fmt(y)}`;
}
function line(r1, r2, deg, stroke, width) {
  const [x1, y1] = polar(r1, deg);
  const [x2, y2] = polar(r2, deg);
  return `<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" stroke="${stroke}" stroke-width="${fmt(width)}"/>`;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}
function dial(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? clamp01(value) : fallback;
}
function normalizeGenome(genome) {
  if (!genome || typeof genome !== "object") return null;
  return {
    seed: Number.isFinite(genome.seed) ? genome.seed >>> 0 : 0,
    world: dial(genome.world, 0.5),
    color: dial(genome.color, 0.5),
    focus: dial(genome.focus, 0),
    depth: dial(genome.depth, 0),
    spread: dial(genome.spread, 0),
    range: dial(genome.range, 0)
  };
}
function markParams(genome) {
  const g = normalizeGenome(genome);
  if (!g) return null;
  const G = MARK_GEOMETRY,
    rng = mulberry32(g.seed);
  const ringPhase = rng() * 360;
  const petals = G.petalMinCount + Math.round(g.focus * G.petalExtraCount);
  const sector = 360 / petals,
    bloomPhase = -90 + rng() * sector;
  const order = Array.from({
    length: petals
  }, (_, i) => i);
  for (let i = petals - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    genome: g,
    petals,
    sector,
    bloomPhase,
    ringPhase,
    tipR: lerp(G.petalTipMinR, G.petalTipMaxR, g.spread),
    tipBulge: lerp(G.tipBulgeMin, G.tipBulgeMax, g.world),
    petalHalfWidthDeg: Math.min(sector * G.petalWidthFactor, G.petalWidthCapDeg),
    stamenTipR: lerp(G.stamenTipMinR, G.stamenTipMaxR, g.range),
    berries: Math.round(g.depth * G.berryMax),
    berryPetalOrder: order,
    burgundySweepDeg: G.ringSliverDeg + (1 - g.color) * (360 - 2 * G.ringGapDeg - 2 * G.ringSliverDeg)
  };
}
function petalPath(angle, p) {
  const G = MARK_GEOMETRY,
    w = p.petalHalfWidthDeg;
  const midR = G.petalBaseR * (1 - G.petalShoulder) + p.tipR * G.petalShoulder;
  const tipHalf = w * 0.25,
    tipInset = 1.5;
  const base = pt(G.petalBaseR, angle),
    left = pt(midR, angle - w),
    right = pt(midR, angle + w);
  const tipL = pt(p.tipR - tipInset, angle - tipHalf),
    tipRt = pt(p.tipR - tipInset, angle + tipHalf);
  const bulgeL = pt(p.tipR + p.tipBulge, angle - tipHalf * 0.4),
    bulgeR = pt(p.tipR + p.tipBulge, angle + tipHalf * 0.4);
  return `M ${base} Q ${left} ${tipL} C ${bulgeL} ${bulgeR} ${tipRt} Q ${right} ${base} Z`;
}
function arcPath(r, startDeg, sweepDeg) {
  const start = pt(r, startDeg),
    end = pt(r, startDeg + sweepDeg);
  return `M ${start} A ${fmt(r)} ${fmt(r)} 0 ${sweepDeg > 180 ? 1 : 0} 1 ${end}`;
}
function markBody(p) {
  const G = MARK_GEOMETRY,
    C = MARK_PALETTE,
    parts = [];
  parts.push(`<circle cx="80" cy="80" r="${fmt(G.discR)}" fill="${C.disc}"/>`);
  parts.push(`<circle cx="80" cy="80" r="${fmt(G.frameOuterR)}" fill="none" stroke="${C.cream}" stroke-width="1.1"/>`);
  parts.push(`<circle cx="80" cy="80" r="${fmt(G.frameInnerR)}" fill="none" stroke="${C.sage}" stroke-width="0.5"/>`);
  parts.push(`<circle cx="80" cy="80" r="${fmt(G.orbitR)}" fill="none" stroke="${C.sage}" stroke-width="1" stroke-dasharray="${G.orbitDash}" stroke-linecap="round"/>`);
  for (let i = 0; i < p.petals; i++) {
    const a = p.bloomPhase + (i + 0.5) * p.sector;
    parts.push(line(G.stamenBaseR, p.stamenTipR, a, C.line, 0.8));
    const [dx, dy] = polar(p.stamenTipR + 1.8, a);
    parts.push(`<circle cx="${fmt(dx)}" cy="${fmt(dy)}" r="1.3" fill="${C.line}"/>`);
  }
  for (let i = 0; i < p.petals; i++) {
    const a = p.bloomPhase + i * p.sector;
    parts.push(`<path d="${petalPath(a, p)}" fill="${C.petal}" stroke="${C.line}" stroke-width="1.2" stroke-linejoin="round"/>`);
    parts.push(line(G.petalBaseR + 4, G.petalBaseR + (p.tipR - G.petalBaseR) * 0.72, a, C.cream, 0.7));
  }
  for (let k = 0; k < p.berries; k++) {
    const petalIndex = p.berryPetalOrder[k % p.petals];
    const a = p.bloomPhase + petalIndex * p.sector;
    const rf = k < p.petals ? 0.52 : 0.34;
    const r = G.petalBaseR + (p.tipR - G.petalBaseR) * rf;
    const [bx, by] = polar(r, a);
    parts.push(`<circle cx="${fmt(bx)}" cy="${fmt(by)}" r="${fmt(G.berryR)}" fill="${C.burgundy}" stroke="${C.cream}" stroke-width="0.8"/>`);
  }
  const gap = G.ringGapDeg,
    creamSweep = 360 - 2 * gap - p.burgundySweepDeg;
  parts.push(`<path d="${arcPath(G.ringR, p.ringPhase, p.burgundySweepDeg)}" fill="none" stroke="${C.burgundy}" stroke-width="${fmt(G.ringWidth)}" stroke-linecap="round"/>`);
  parts.push(`<path d="${arcPath(G.ringR, p.ringPhase + p.burgundySweepDeg + gap, creamSweep)}" fill="none" stroke="${C.cream}" stroke-width="${fmt(G.ringWidth)}" stroke-linecap="round"/>`);
  parts.push(`<circle cx="80" cy="80" r="${fmt(G.coreR)}" fill="${C.burgundy}" stroke="${C.cream}" stroke-width="1"/>`);
  return parts.join("");
}
function renderPalateMark(genome, {
  size = 96
} = {}) {
  const p = markParams(genome);
  if (!p) return "";
  const v = MARK_GEOMETRY.view;
  return `<svg viewBox="0 0 ${v} ${v}" width="${fmt(size)}" height="${fmt(size)}" aria-hidden="true" role="presentation" focusable="false">${markBody(p)}</svg>`;
}
/** The generative Wine DNA mark — a protea bloom on a forest medallion, grown from a 7-dial genome. Decorative (aria-hidden); the identity title beside it is the accessible name. Missing genome renders nothing. */
function PalateMark({
  genome,
  size = 96,
  style
}) {
  const svg = renderPalateMark(genome, {
    size
  });
  if (!svg) return null;
  return /*#__PURE__*/React.createElement("span", {
    "data-testid": "palate-mark",
    "aria-hidden": "true",
    style: {
      display: "inline-flex",
      lineHeight: 0,
      flexShrink: 0,
      ...style
    },
    dangerouslySetInnerHTML: {
      __html: svg
    }
  });
}
Object.assign(__ds_scope, { MARK_PALETTE, MARK_GEOMETRY, normalizeGenome, markParams, renderPalateMark, PalateMark });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/wine/PalateMark.jsx", error: String((e && e.message) || e) }); }

// components/wine/SignatureRail.jsx
try { (() => {
const SANS = "'Source Sans 3', sans-serif";
/** Palate-signature rail: two tracked labels, a ticked 2px scale, and a burgundy diamond that eases to position (0–1). */
function SignatureRail({
  leftLabel,
  rightLabel,
  position = 0.5,
  mounted = true,
  delay = 0
}) {
  const pct = Math.round(Math.min(1, Math.max(0, position)) * 100);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 22
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: SANS,
      fontSize: "10px",
      textTransform: "uppercase",
      letterSpacing: "0.14em",
      color: "#1B3D2F",
      opacity: 0.5,
      fontWeight: 600
    }
  }, leftLabel), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: SANS,
      fontSize: "10px",
      textTransform: "uppercase",
      letterSpacing: "0.14em",
      color: "#1B3D2F",
      opacity: 0.5,
      fontWeight: 600
    }
  }, rightLabel)), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      height: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 5,
      left: 0,
      right: 0,
      height: 2,
      background: "rgba(27,61,47,0.14)",
      borderRadius: 1
    }
  }), [0, 25, 50, 75, 100].map(t => /*#__PURE__*/React.createElement("div", {
    key: t,
    style: {
      position: "absolute",
      top: 3,
      left: `${t}%`,
      width: 1,
      height: 6,
      background: "rgba(27,61,47,0.18)",
      transform: "translateX(-0.5px)"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 1,
      width: 10,
      height: 10,
      left: mounted ? `${pct}%` : "50%",
      transform: "translateX(-5px) rotate(45deg)",
      background: "#8B2332",
      boxShadow: "0 1px 4px rgba(139,35,50,0.35)",
      transition: `left 0.9s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`
    }
  })));
}
Object.assign(__ds_scope, { SignatureRail });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/wine/SignatureRail.jsx", error: String((e && e.message) || e) }); }

// components/wine/WineRecCard.jsx
try { (() => {
const SANS = "'Source Sans 3', sans-serif";
const SERIF = "'Playfair Display', Georgia, serif";
const MATCH_LABELS = {
  "region + grape": "📍 Region + grape match",
  grape: "🍇 Grape match",
  region: "📍 Region match",
  discovery: "🧭 Discovery pick"
};
/** Recommendation card: rank badge (#1 burgundy), serif wine name, why line, match label, and the Had it / Want to try / Not for me action row. */
function WineRecCard({
  wine,
  why,
  matchType = "discovery",
  index = 0,
  readOnly,
  onAction
}) {
  const act = type => onAction && onAction(wine, type);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "rgba(255,255,255,0.55)",
      borderRadius: "16px",
      padding: "18px 20px",
      border: "1px solid rgba(27,61,47,0.06)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: "16px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 30,
      height: 30,
      borderRadius: "50%",
      background: index === 0 ? "linear-gradient(135deg, #8B2332, #6B1D2A)" : "rgba(27,61,47,0.07)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: index === 0 ? "#F5F0E8" : "#1B3D2F",
      fontFamily: SERIF,
      fontSize: "13px",
      fontWeight: 700,
      flexShrink: 0,
      marginTop: 1,
      boxShadow: index === 0 ? "0 2px 8px rgba(139,35,50,0.25)" : "none"
    }
  }, index + 1), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: SERIF,
      fontSize: "16px",
      color: "#1B3D2F",
      lineHeight: 1.35,
      marginBottom: 5
    }
  }, wine), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: SANS,
      fontSize: "13px",
      color: "#1B3D2F",
      opacity: 0.5,
      lineHeight: 1.5
    }
  }, why), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: SANS,
      fontSize: "10px",
      color: "#8B2332",
      opacity: 0.55,
      marginTop: 8,
      textTransform: "uppercase",
      letterSpacing: "0.1em",
      fontWeight: 600
    }
  }, MATCH_LABELS[matchType] || MATCH_LABELS.discovery))), !readOnly && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "8px",
      marginTop: 14,
      paddingTop: 14,
      borderTop: "1px solid rgba(27,61,47,0.06)"
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => act("had"),
    style: {
      flex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "6px",
      padding: "9px 8px",
      borderRadius: "10px",
      minHeight: 40,
      border: "1px solid rgba(139,35,50,0.12)",
      background: "rgba(139,35,50,0.04)",
      fontFamily: SANS,
      fontSize: "12px",
      color: "#8B2332",
      fontWeight: 600,
      cursor: "pointer",
      transition: "all 0.15s ease"
    }
  }, "\uD83C\uDF77 Had it"), /*#__PURE__*/React.createElement("button", {
    onClick: () => act("want"),
    style: {
      flex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "6px",
      padding: "9px 8px",
      borderRadius: "10px",
      minHeight: 40,
      border: "1px solid rgba(27,61,47,0.1)",
      background: "rgba(27,61,47,0.03)",
      fontFamily: SANS,
      fontSize: "12px",
      color: "#1B3D2F",
      fontWeight: 500,
      cursor: "pointer",
      transition: "all 0.15s ease"
    }
  }, "\uD83D\uDCCC Want to try"), /*#__PURE__*/React.createElement("button", {
    onClick: () => act("skip"),
    style: {
      flex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "6px",
      padding: "9px 8px",
      borderRadius: "10px",
      minHeight: 40,
      border: "1px solid rgba(27,61,47,0.06)",
      background: "transparent",
      fontFamily: SANS,
      fontSize: "12px",
      color: "#1B3D2F",
      opacity: 0.4,
      fontWeight: 500,
      cursor: "pointer",
      transition: "all 0.15s ease"
    }
  }, "\uD83D\uDC4B Not for me")));
}
Object.assign(__ds_scope, { WineRecCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/wine/WineRecCard.jsx", error: String((e && e.message) || e) }); }

// doc-page.js
try { (() => {
// @ds-adherence-ignore -- omelette starter scaffold (raw elements/hex/px by design)
// Copied omelette starter. Re-running copy_starter_component with this kind overwrites this file with the latest version (page content is unaffected).
/* BEGIN USAGE */
/**
 * <doc-page> — paged-document shell for printable HTML.
 *
 * FIRST, decide how the document paginates — up front, before building:
 *
 * - FLOWING document (the default): write the whole document as one
 *   normal HTML flow inside <doc-page>; the browser's print engine
 *   splits it onto pages at export. Use for long-form documents with a
 *   single text flow: reports, memos, letters, essays.
 * - EXPLICIT pagination: a fixed set of pre-paginated pages, one
 *   <section class="page"> child per page. Use when the user asks for a
 *   specific page count, or the design implies one: a one-page resume, a
 *   two-sided flier, a poster, a certificate, a brochure — any richly
 *   laid-out document without a single text flow.
 * - If in doubt, ask the user as part of the build.
 *
 * PAGE SIZING — paper differs by country (letter vs A4), so the printed
 * sheet is not one fixed truth:
 * - FLOWING documents pin NO paper size: the print engine paginates
 *   onto the user's real paper, and the content reflows to it.
 * - EXPLICITLY PAGINATED documents print each page at a FIXED page box
 *   with overflow hidden — letter by default, size="a4" for a clearly
 *   metric user, the user's chosen paper when they export. Design each
 *   page to FILL that box, fitting letter and A4 alike without overlap.
 * - width/height pin an explicit fixed size, ONLY when the user gives
 *   one.
 * Never write your own @page rule or hard-code paper dimensions in the
 * content.
 *
 * Sizing modes (attributes):
 *   (none)                      — portrait: flowing docs use the user's
 *           paper; explicitly paginated pages use the named size box
 *           (letter unless size="a4")
 *   orientation="landscape"     — the same, landscape
 *   width / height              — explicit fixed size, ONLY when the user
 *           gives one (e.g. width="22in" height="30in" for a 22×30
 *           poster): the page IS the design's size, printed at true
 *           dimensions (or scaled onto the user's paper at print time).
 *           Any absolute CSS length: px/in/mm/cm/pt/pc.
 * The component announces the chosen mode to the host app at runtime (a
 * meta tag it injects), so the print path can inject the user's true
 * paper size.
 *
 * On screen the document renders on a desk background: a flowing
 * document as one tall scrolling sheet (Google Docs' pageless view);
 * explicitly paginated documents as one card per page.
 *
 * EXPLICIT pagination usage:
 *   <style>doc-page:not(:defined){visibility:hidden}</style>
 *   <doc-page>
 *     <section class="page" id="p1">…one page's design…</section>
 *     <section class="page" id="p2">…</section>
 *   </doc-page>
 *   <script src="doc-page.js"></script>
 * How the page box works, concretely: each .page prints as ONE full-bleed
 * sheet at a FIXED physical size — letter by default (set size="a4" for
 * a clearly metric user), the user's chosen paper when they export —
 * with overflow hidden. Nothing scrolls and nothing reflows onto a next
 * sheet: content that misses the box is CLIPPED. Design each page to
 * FILL that page box, and to fit it — letter and A4 alike — without
 * overlap. Each page is a size container; don't size anything in
 * viewport units (they track the window, not the page), and never set
 * width or height on the .page section itself (the component sizes the
 * page box; an authored height like 100% is meaningless at print and is
 * overridden). The component owns the page box, the screen card chrome,
 * and the page breaks (never add your own break-before/after). Don't mix
 * .page sections with flowing content or header/footer slots in the same
 * document.
 *
 * FLOWING usage:
 *   <style>doc-page:not(:defined){visibility:hidden}</style>
 *   <doc-page margin="0.75in">
 *     <h1>Title</h1>
 *     <p>…body…</p>
 *   </doc-page>
 *   <script src="doc-page.js"></script>
 * There is no manual page-splitting — the browser's print engine
 * paginates at export. Standard break-hygiene rules (`break-inside:
 * avoid` on figures, code blocks, images and table rows; `orphans/
 * widows: 3`) are applied so paragraphs and groups split cleanly. On
 * screen and at print, headings default to `text-wrap: balance` and
 * body text to `text-wrap: pretty`; the defaults have zero specificity,
 * so any text-wrap you declare wins.
 *
 * Other attributes:
 *   size    — letter | a4 | legal (default letter). Flowing documents:
 *           preview proportion only — it does NOT pin their printed
 *           paper (the print dialog's paper governs); leave it alone
 *           there. Explicitly paginated documents: it sets the page box
 *           the cards and the pinned @page share (the export dialog's
 *           choice overrides both at print) — set size="a4" for a
 *           clearly metric user. Scaled-fit: names the sheet the fit is
 *           computed against, same a4-for-metric-users advice.
 *   content-width / content-height — the design's own fixed dimensions
 *           (CSS lengths), for scaling a fixed-size design ONTO the
 *           named sheet: content lays out at exactly this size, and the
 *           component scales it to fit that sheet's printable area
 *           (centered horizontally, top-aligned; the export dialog
 *           re-fits to the user's actual paper choice where available).
 *           Both must be set; they do not change the page box. For pages
 *           WITHOUT running header/footer slots.
 *   margin  — printable inset on every page of a FLOWING document
 *           (default 0.75in); margin="0" makes pages full-bleed.
 *           Explicitly paginated pages are always full-bleed.
 *
 * Running header/footer (flowing documents only): give an element
 * `slot="header"` or `slot="footer"` and it repeats on every printed
 * page via `position: fixed`. To keep body text from sliding under it,
 * the component prints inside a single-cell table whose <thead>/<tfoot>
 * are spacers sized to the header/footer height — browsers repeat
 * thead/tfoot on every page, so each sheet's content starts below the
 * header and ends above the footer. On screen the header/footer render
 * once at the top/bottom of the sheet.
 *
 * At print the component injects `@page { margin: 0 }` (which leaves
 * Chrome no margin box to draw its date/URL/page-count header in) and
 * moves the visual margin onto the sheet's own padding. It also marks
 * the document as owning its print CSS (a
 * `meta[name="omelette-owns-print"]` it injects at runtime), so the
 * PDF export never injects page-geometry CSS of its own on top.
 *
 * Print best practices for the content you author:
 * - Multi-column text: use CSS columns (`column-count` +
 *   `column-gap`), never side-by-side flex/grid columns — only real
 *   CSS columns flow and break across pages. `column-span: all` lets
 *   a heading span the columns; `hyphens: auto` (needs `lang` on
 *   the html element) keeps narrow columns readable.
 * - Page breaks in flowing documents: `break-before: page` on an
 *   element that must start a new page (a chapter, an appendix). Add
 *   your own kept-together blocks (callouts, stat tiles, cards) to a
 *   `break-inside: avoid` rule, and keep each one shorter than a page.
 * - Extend `orphans: 3; widows: 3` to any custom text blocks you add
 *   (p and li are covered by default).
 * - Give long tables a <thead> — browsers repeat it on every printed
 *   page.
 * - No `position: fixed`/`sticky` and no viewport units in content:
 *   fixed elements stamp every printed page (running headers/footers go
 *   in the component's slots) and `100vh` mis-sizes at print.
 *
 * Author content as static HTML so the user can click-to-edit any text
 * directly. Do not set width/padding/background on the document body —
 * the component owns the sheet box.
 */
/* END USAGE */

(() => {
  const PAPER = {
    letter: ['8.5in', '11in'],
    a4: ['210mm', '297mm'],
    legal: ['8.5in', '14in']
  };
  const CSS_LENGTH = /^\d+(\.\d+)?(px|in|mm|cm|pt|pc)$/;
  // Unitless "0" is a valid CSS length and the natural way to write
  // margin="0"; normalise it to 0px so max()/calc() (which reject a bare
  // number) keep working.
  const safeLen = (v, fb) => {
    v = (v || '').trim();
    return v === '0' ? '0px' : CSS_LENGTH.test(v) ? v : fb;
  };
  // WebKit (Safari and every iOS browser shell) never repeats a table's
  // thead/tfoot on printed pages (WebKit bug 17205), so the spacer-borne
  // vertical margins of a FLOWING document reach only the first page
  // there. Engine check, not browser check: vendor is 'Apple Computer,
  // Inc.' exactly for WebKit and 'Google Inc.' for Blink.
  const WK_PRINT = /apple/i.test(navigator.vendor || '');
  // CSS length → px number (CSS absolute units are exact: 1in = 96px).
  // Returns NaN for anything safeLen would reject — callers gate on it.
  const PX_PER = {
    px: 1,
    in: 96,
    mm: 96 / 25.4,
    cm: 96 / 2.54,
    pt: 96 / 72,
    pc: 16
  };
  const toPx = v => {
    const m = /^(\d+(?:\.\d+)?)(px|in|mm|cm|pt|pc)$/.exec((v || '').trim());
    return m ? parseFloat(m[1]) * PX_PER[m[2]] : NaN;
  };
  const stylesheet = `
    :host {
      position: relative;
      display: block;
      /* When the viewport is narrower than the page, grow to wrap the
       * sheet (plus this padding) instead of staying viewport-width, so
       * the desk background and right margin reach the sheet's far edge
       * in the horizontal scroll. */
      min-width: max-content;
      min-height: 100vh;
      background: #f5f5f4;
      padding: 48px 24px;
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
      --doc-page-w: 8.5in;
      --doc-page-h: 11in;
      --doc-page-margin: 0.75in;
      --doc-hdr-h: 0px;
      --doc-ftr-h: 0px;
      --doc-hdr-pad: 0px;
      --doc-ftr-pad: 0px;
    }
    .sheet {
      width: var(--doc-page-w);
      margin: 0 auto;
      background: #fff;
      box-shadow: 0 2px 10px rgba(20, 20, 19, 0.12);
      border-radius: 7px;
      box-sizing: border-box;
      padding: var(--doc-page-margin);
    }
    .frame { width: 100%; border-collapse: collapse; }
    /* Scaled-fit mode (content-width/content-height): the inner .fit box
     * lays the content out at its authored fixed size and scales it onto
     * the printable area; .fit-box reserves the scaled footprint in flow
     * (transforms don't affect layout) and centers it. Without the mode,
     * both divs are unstyled block pass-throughs. */
    /* Explicit pagination: direct .page children are the pages. The sheet
     * becomes a transparent stack and each page carries the card look on
     * screen; at print each page is exactly one full-bleed sheet. The
     * ::slotted defaults are deliberately weak (document CSS wins), so
     * authored page styling can override any of this. */
    .sheet.paginated {
      background: transparent;
      box-shadow: none;
      border-radius: 0;
      padding: 0;
    }
    .paginated ::slotted(.page) {
      position: relative;
      display: block;
      width: 100%;
      aspect-ratio: var(--doc-page-ar);
      container-type: size;
      overflow: hidden;
      box-sizing: border-box;
      background: #fff;
      border-radius: 7px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
      break-inside: avoid;
    }
    .paginated ::slotted(.page:not(:first-child)) { margin-top: 1rem; }
    @media print {
      .sheet.paginated { padding: 0; }
      /* The flowing-document vertical inset lives on the repeating
       * thead/tfoot spacers, not the sheet padding — they must go too,
       * or each full-sheet .page is pushed ~margin down and spills onto
       * a second sheet. Paginated pages are full-bleed by definition
       * (content owns its insets). */
      .sheet.paginated .hdr-space,
      .sheet.paginated .ftr-space { height: 0; }
      .paginated ::slotted(.page) {
        border-radius: 0 !important;
        box-shadow: none !important;
        margin: 0 !important;
        /* Physical page-box sizing, no viewport units: Safari resolves
         * 100vh against the window, not the page box, so a vh-sized card
         * paginates wrong there. --doc-page-w/h are the named size by
         * default and are overridden to the user's chosen paper by the
         * export path, so every card is exactly one sheet either way.
         * Width + height (same source values as @page size) rather than
         * width + aspect-ratio: the ratio is a 6-decimal rounding of the
         * same division, and a few millionths of overflow would spill a
         * blank sheet after every page. The screen-only aspect-ratio
         * (preview proportions) must not leak into print. cqh typography
         * tracks the same box.
         *
         * Every declaration is !important: per CSS Scoping, unimportant
         * shadow ::slotted rules LOSE to the document context, so a page
         * section's authored inline style would silently beat this print
         * geometry. A model-authored height:100% did exactly that — the
         * percentage resolves as auto in the all-auto print ancestry, the
         * base rule's size containment turns auto into ZERO, and
         * overflow:hidden then paints nothing: a blank PDF with perfect
         * page boxes. At print the component's geometry is the design's
         * whole contract, so it must win over any authored sizing. */
        aspect-ratio: auto !important;
        width: var(--doc-page-w) !important;
        height: var(--doc-page-h) !important;
        overflow: hidden !important;
      }
      .paginated ::slotted(.page:not(:first-child)) {
        break-before: page !important;
        margin-top: 0 !important;
      }
    }
    .fit-mode .fit-box {
      width: calc(var(--doc-fit-w) * var(--doc-fit-scale));
      height: calc(var(--doc-fit-h) * var(--doc-fit-scale));
      margin: 0 auto;
      break-inside: avoid;
    }
    .fit-mode .fit {
      width: var(--doc-fit-w);
      height: var(--doc-fit-h);
      transform: scale(var(--doc-fit-scale));
      transform-origin: top left;
    }
    .frame td, .frame th { padding: 0; text-align: left; font-weight: inherit; }
    .hdr-space { height: var(--doc-hdr-h); }
    .ftr-space { height: var(--doc-ftr-h); }
    ::slotted([slot="header"]),
    ::slotted([slot="footer"]) { display: block; box-sizing: border-box; }
    @media print {
      :host { background: none; padding: 0; min-width: 0; min-height: 0; }
      .sheet {
        width: auto; margin: 0; box-shadow: none; border-radius: 0;
        padding: 0 var(--doc-page-margin);
      }
      /* The thead/tfoot spacers repeat on every page, so they carry the
       * vertical page margin (which the sheet's own padding cannot, since
       * that padding is consumed once on the first/last page). The running
       * header/footer are fixed inside that band. */
      /* The 0.35in is breathing room between a running header/footer and
       * the body; without one the spacer is exactly the page margin, so a
       * margin="0" full-bleed document gets truly full-bleed pages. */
      .hdr-space { height: max(var(--doc-page-margin), calc(var(--doc-hdr-h) + var(--doc-hdr-pad))); }
      .ftr-space { height: max(var(--doc-page-margin), calc(var(--doc-ftr-h) + var(--doc-ftr-pad))); }
      /* WebKit flowing documents: @page carries the vertical margin (see
       * _syncPrintPageRule), so the spacers keep only whatever a running
       * header/footer needs BEYOND it — page 1 would otherwise double its
       * top inset. Paginated sheets already zero their spacers above. */
      .sheet.wk-print:not(.paginated) .hdr-space { height: max(0px, calc(max(var(--doc-page-margin), calc(var(--doc-hdr-h) + var(--doc-hdr-pad))) - var(--doc-page-margin))); }
      .sheet.wk-print:not(.paginated) .ftr-space { height: max(0px, calc(max(var(--doc-page-margin), calc(var(--doc-ftr-h) + var(--doc-ftr-pad))) - var(--doc-page-margin))); }
      ::slotted([slot="header"]) {
        position: fixed; top: 0; left: 0; right: 0; margin: 0;
        padding: calc(var(--doc-page-margin) * 0.45) var(--doc-page-margin) 0;
      }
      ::slotted([slot="footer"]) {
        position: fixed; bottom: 0; left: 0; right: 0; margin: 0;
        padding: 0 var(--doc-page-margin) calc(var(--doc-page-margin) * 0.45);
      }
    }
  `;
  class DocPage extends HTMLElement {
    static get observedAttributes() {
      return ['size', 'width', 'height', 'margin', 'orientation', 'content-width', 'content-height'];
    }
    constructor() {
      super();
      this._root = this.attachShadow({
        mode: 'open'
      });
      this._mo = typeof MutationObserver === 'function' ? new MutationObserver(() => this._scheduleMeasure()) : null;
    }

    /** The named paper's [w, h], swapped when orientation="landscape".
     *  Only the named size swaps — explicit width/height are exact values
     *  the author already oriented. */
    _paperSize() {
      const named = PAPER[(this.getAttribute('size') || '').toLowerCase()] || PAPER.letter;
      const landscape = (this.getAttribute('orientation') || '').trim().toLowerCase() === 'landscape';
      return landscape ? [named[1], named[0]] : named;
    }
    get pageWidth() {
      return safeLen(this.getAttribute('width'), this._paperSize()[0]);
    }
    get pageHeight() {
      return safeLen(this.getAttribute('height'), this._paperSize()[1]);
    }
    get pageMargin() {
      return safeLen(this.getAttribute('margin'), '0.75in');
    }

    /** Scaled-fit mode's content box [w, h] as CSS lengths, or null when
     *  the mode is off (either attribute missing/invalid/zero — a partial
     *  declaration falls back to normal flow rather than guessing). */
    _contentFit() {
      const w = safeLen(this.getAttribute('content-width'), null);
      const h = safeLen(this.getAttribute('content-height'), null);
      if (!w || !h) return null;
      const wPx = toPx(w),
        hPx = toPx(h);
      return wPx > 0 && hPx > 0 ? [w, h, wPx, hPx] : null;
    }
    connectedCallback() {
      if (!this._sheet) this._render();
      this._syncSize();
      this._syncPrintPageRule();
      this._ensureTextWrapDefaults();
      this._ensureOwnsPrintMeta();
      this._syncFixedSizeMeta();
      this._syncPrintSizingMeta();
      if (this._mo) this._mo.observe(this, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true
      });
      this._onResize = () => this._scheduleMeasure();
      window.addEventListener('resize', this._onResize);
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => this._scheduleMeasure());
      }
      this._scheduleMeasure();
    }
    disconnectedCallback() {
      window.removeEventListener('resize', this._onResize);
      if (this._mo) this._mo.disconnect();
      if (this._raf) {
        cancelAnimationFrame(this._raf);
        this._raf = null;
      }
      // Drop the head rules when the last doc-page leaves, so a deleted
      // document's @page geometry and text-wrap defaults can't apply to
      // whatever replaces it.
      const survivor = document.querySelector('doc-page');
      if (!survivor) {
        ['doc-page-print', 'doc-page-text-wrap', 'doc-page-owns-print', 'doc-page-fixed-size', 'doc-page-print-sizing'].forEach(id => {
          const tag = document.getElementById(id);
          if (tag) tag.remove();
        });
        // A live deck-stage deferred its own print-sizing meta to ours —
        // hand the page-global meta over so the deck isn't left unmarked.
        const deck = document.querySelector('deck-stage');
        if (deck && typeof deck._ensurePrintSizingMeta === 'function') {
          deck._ensurePrintSizingMeta();
        }
      } else {
        // A departed owner hands each page-global meta to whatever
        // doc-page remains (or it's removed).
        if (typeof survivor._syncFixedSizeMeta === 'function') {
          survivor._syncFixedSizeMeta();
        }
        if (typeof survivor._syncPrintSizingMeta === 'function') {
          survivor._syncPrintSizingMeta();
        }
      }
    }
    attributeChangedCallback() {
      if (!this._sheet) return;
      this._syncSize();
      this._syncPrintPageRule();
      this._syncFixedSizeMeta();
      this._syncPrintSizingMeta();
      this._scheduleMeasure();
    }
    _render() {
      this._root.innerHTML = `
        <style>${stylesheet}</style>
        <style id="vars"></style>
        <div class="sheet" data-screen-label="Document">
          <table class="frame" role="presentation">
            <thead><tr><th><div class="hdr-space"><slot name="header"></slot></div></th></tr></thead>
            <tbody><tr><td class="body"><div class="fit-box"><div class="fit"><slot></slot></div></div></td></tr></tbody>
            <tfoot><tr><td><div class="ftr-space"><slot name="footer"></slot></div></td></tr></tfoot>
          </table>
        </div>`;
      this._sheet = this._root.querySelector('.sheet');
      this._vars = this._root.getElementById('vars');
    }

    /** Runtime sizing lives in a shadow <style> :host rule, never on the
     *  light-DOM host element, so serialize-persist can't write it back. */
    _syncSize(hdrH, ftrH) {
      // Scaled-fit mode: content at its authored size, scaled onto the
      // printable area (page minus margins on both axes). The factor is a
      // plain number var so calc(length * number) stays valid; 4 decimals
      // keeps the shadow style stable across re-measures. Upscaling is
      // allowed — print transforms are vector, so text and CSS stay crisp
      // (raster images soften, which the catalog bullet warns about).
      const fit = this._contentFit();
      let fitVars = '';
      if (fit) {
        const marginPx = toPx(this.pageMargin) || 0;
        const availW = toPx(this.pageWidth) - 2 * marginPx;
        const availH = toPx(this.pageHeight) - 2 * marginPx;
        const scale = Math.min(availW / fit[2], availH / fit[3]);
        if (scale > 0 && Number.isFinite(scale)) {
          fitVars = '--doc-fit-w:' + fit[0] + ';' + '--doc-fit-h:' + fit[1] + ';' + '--doc-fit-scale:' + scale.toFixed(4) + ';';
        }
      }
      this._sheet.classList.toggle('fit-mode', !!fitVars);
      // Numeric w/h ratio for the paginated page cards' aspect-ratio —
      // aspect-ratio takes a number, not a length ratio, so compute it
      // here (CSS length division isn't portable). 6 decimals keeps the
      // shadow style stable across re-syncs.
      const arW = toPx(this.pageWidth);
      const arH = toPx(this.pageHeight);
      const ar = arW > 0 && arH > 0 ? (arW / arH).toFixed(6) : '0.772727';
      this._vars.textContent = ':host{' + fitVars + '--doc-page-ar:' + ar + ';' + '--doc-page-w:' + this.pageWidth + ';' + '--doc-page-h:' + this.pageHeight + ';' + '--doc-page-margin:' + this.pageMargin + ';' + '--doc-hdr-h:' + (hdrH || 0) + 'px;' + '--doc-ftr-h:' + (ftrH || 0) + 'px;' + '--doc-hdr-pad:' + (hdrH ? '0.35in' : '0px') + ';' + '--doc-ftr-pad:' + (ftrH ? '0.35in' : '0px') + '}';
    }

    /** @page is a no-op inside shadow DOM, so the rule lives in <head>.
     *  Re-appended on every sync so it stays last in source order — the
     *  @page cascade is source-order per descriptor, so this rule wins
     *  over any other @page rule in the document.
     *
     *  The @page SIZE is pinned where the page box IS part of the design:
     *  explicit-fixed-size mode (width + height authored), scaled-fit
     *  mode (the named sheet the fit targets), and explicit pagination
     *  (the named size the cards share — so card and sheet agree on
     *  every print path, and the export path's chosen paper overrides
     *  BOTH with one later rule). For FLOWING documents no paper size is
     *  emitted at all — the true size comes from the user's preference,
     *  injected by the export path or chosen in the print dialog — so a
     *  flowing document never fights the paper it lands on.
     *  margin: 0 is emitted in every mode: it leaves Chrome no margin box
     *  to draw its date/URL/page-count header in, and the visual margin
     *  lives on the sheet's own padding. */
    _syncPrintPageRule() {
      const id = 'doc-page-print';
      let tag = document.getElementById(id);
      if (!tag) {
        tag = document.createElement('style');
        tag.id = id;
      }
      document.head.appendChild(tag);
      // Three print-geometry regimes:
      // - true-size: the page IS the design — pin its exact size.
      // - scaled-fit (content-width/height): the fit factor is computed
      //   against the NAMED paper's printable area, so that paper must
      //   stay pinned or the scaled content overflows a smaller sheet
      //   (the export path re-fits and re-pins at print time on top).
      // - default modes: no paper size — but landscape still needs the
      //   paper-agnostic 'size: landscape' keyword, because the size
      //   descriptor is what carries orientation; without it a landscape
      //   document prints portrait whenever nothing injects a size.
      const landscape = (this.getAttribute('orientation') || '').trim().toLowerCase() === 'landscape';
      // Explicit pagination pins the page box to the SAME values that
      // size the cards (the named size by default, the export path's
      // chosen paper when its later rule overrides both) — card and
      // sheet agree on every print path, and a mismatched real paper
      // shrinks-to-fit in the dialog instead of clipping a Letter card
      // on A4. Declared before the paginated read below so both derive
      // from one check.
      const paginatedNow = this.querySelector(':scope > .page') !== null;
      const sizeDescriptor = this._trueSizePx() ? 'size: ' + this.pageWidth + ' ' + this.pageHeight + '; ' : this._contentFit() ? 'size: ' + this.pageWidth + ' ' + this.pageHeight + '; ' : paginatedNow ? 'size: ' + this.pageWidth + ' ' + this.pageHeight + '; ' : landscape ? 'size: landscape; ' : '';
      // WebKit never repeats the thead/tfoot spacers that carry a flowing
      // document's vertical page margins (see WK_PRINT above), so pages
      // after the first print edge-to-edge there. Carry the VERTICAL
      // margins on @page for WebKit instead, and the shadow print CSS
      // trims the first-page spacers by the same amount (.sheet.wk-print
      // rules). Horizontal inset stays on the sheet's own padding in
      // every engine. Blink keeps margin: 0 (a nonzero margin there
      // re-opens the box Chrome draws its header furniture in). One cost,
      // learned in testing: Safari's own date/URL headers are a USER
      // dialog setting ("Print headers and footers") that renders in the
      // margin area when room exists — margin: 0 only suppressed it by
      // leaving no room, and no CSS controls it. The export dialog's
      // Safari guide teaches turning the setting off for flowing
      // documents. Explicitly paginated and fixed-size documents keep
      // margin: 0 everywhere: their pages ARE the sheet.
      const wkFlowing = WK_PRINT && !paginatedNow && !this._trueSizePx() && !this._contentFit();
      const marginDescriptor = wkFlowing ? 'margin: ' + this.pageMargin + ' 0; ' : 'margin: 0; ';
      // Shadow-internal marker (never serialized), kept in lockstep with
      // the @page decision above: the print CSS trims the first-page
      // spacers ONLY while @page actually carries the margins — a
      // true-size or scaled-fit sheet keeps margin: 0 and must keep its
      // spacers too. Re-synced here so attribute changes and pagination
      // flips move both together.
      if (this._sheet) this._sheet.classList.toggle('wk-print', wkFlowing);
      tag.textContent = '@page { ' + sizeDescriptor + marginDescriptor + '} ' + '@media print { html, body { margin: 0 !important; padding: 0 !important; background: none !important; height: auto !important; overflow: visible !important; } ' + 'h1,h2,h3,h4,h5,h6 { break-after: avoid; } ' + 'figure,pre,blockquote,img,svg,tr { break-inside: avoid; } ' + 'p,li { orphans: 3; widows: 3; } ' + '* { -webkit-print-color-adjust: exact; print-color-adjust: exact; ' + 'backdrop-filter: none !important; -webkit-backdrop-filter: none !important; } ' + '*, *::before, *::after { animation-delay: -99s !important; animation-duration: .001s !important; ' + 'animation-iteration-count: 1 !important; animation-fill-mode: both !important; ' + 'animation-play-state: running !important; transition-duration: 0s !important; } }';
    }

    /** Typographic defaults for document text: balance headings, avoid
     *  widowed/orphaned words in body copy (browsers without text-wrap
     *  support drop the declarations). Zero-specificity via :where() so
     *  any text-wrap authored on those elements wins; document-level so the
     *  rules reach the slotted (light DOM) content — shadow styles can't.
     *  data-omelette-injected marks the tag for the host editor to strip
     *  at serialize, so it is never written back as authored source. */
    _ensureTextWrapDefaults() {
      if (document.getElementById('doc-page-text-wrap')) return;
      const tag = document.createElement('style');
      tag.id = 'doc-page-text-wrap';
      tag.setAttribute('data-omelette-injected', '');
      tag.textContent = ':where(h1,h2,h3,h4,h5,h6){text-wrap:balance}' + ':where(p,li,blockquote,figcaption){text-wrap:pretty}';
      document.head.appendChild(tag);
    }

    /** Declares that this document owns its print CSS. The instant-PDF
     *  export checks for the meta by NAME PRESENCE alone (content is
     *  ignored) and skips its automatic print-CSS injections, so the
     *  component's @page geometry is never overridden by a heuristic.
     *  data-omelette-injected keeps it out of serialized source. */
    _ensureOwnsPrintMeta() {
      if (document.getElementById('doc-page-owns-print')) return;
      const tag = document.createElement('meta');
      tag.id = 'doc-page-owns-print';
      tag.name = 'omelette-owns-print';
      tag.content = 'true';
      tag.setAttribute('data-omelette-injected', '');
      document.head.appendChild(tag);
    }

    /** This page's valid true-size page box (explicit width AND height)
     *  as [w, h] px ints, or null when the mode is off. */
    _trueSizePx() {
      if (!safeLen(this.getAttribute('width'), null) || !safeLen(this.getAttribute('height'), null)) return null;
      const w = Math.round(toPx(this.pageWidth));
      const h = Math.round(toPx(this.pageHeight));
      return w > 0 && h > 0 ? [w, h] : null;
    }

    /** True-size pages (explicit width AND height) also declare the page
     *  box as the preview size: the in-app preview reads
     *  meta[name="omelette-fixed-size"] (content "W,H" in px ints) and
     *  scales the sheet into view — without it an 18in poster previews at
     *  true size with scrollbars. Never overrides an author-set meta
     *  (only the component's own id is managed). The meta is page-global
     *  while doc-page instances are not, so every sync recomputes the
     *  page-wide owner — the first connected true-size doc-page — and a
     *  non-true-size sibling's sync can never delete the owner's meta.
     *  Removed when no true-size page remains (the owner's disconnect
     *  re-syncs via any survivor) or when an author-set meta exists. */
    _syncFixedSizeMeta() {
      const id = 'doc-page-fixed-size';
      const own = document.getElementById(id);
      const authored = document.querySelector('meta[name="omelette-fixed-size"]:not([data-omelette-injected])');
      // The page-wide owner, not this instance: an upgraded true-size page
      // anywhere in the document keeps the meta alive and sized.
      let box = null;
      for (const el of document.querySelectorAll('doc-page')) {
        box = typeof el._trueSizePx === 'function' ? el._trueSizePx() : null;
        if (box) break;
      }
      if (!box || authored) {
        if (own) own.remove();
        return;
      }
      const tag = own || document.createElement('meta');
      tag.id = id;
      tag.name = 'omelette-fixed-size';
      tag.content = box[0] + ',' + box[1];
      tag.setAttribute('data-omelette-injected', '');
      if (!own) document.head.appendChild(tag);
    }

    /** This page's print-sizing mode: 'fixed' when an explicit width AND
     *  height are authored (the page is the design's own size), else the
     *  default paper in the authored orientation. */
    _printSizingMode() {
      if (this._trueSizePx()) return 'fixed';
      const landscape = (this.getAttribute('orientation') || '').trim().toLowerCase() === 'landscape';
      return landscape ? 'default-landscape' : 'default-portrait';
    }

    /** Announces the print-sizing mode to the host app:
     *  meta[name="omelette-print-sizing"] with content 'default-portrait',
     *  'default-landscape', or 'fixed' (fixed pages also carry the
     *  omelette-fixed-size meta with the page box in px). The export path
     *  probes it to decide what true paper size to inject at print time —
     *  in the default modes the component emits no paper size of its own.
     *  Same page-global ownership rules as the fixed-size meta above:
     *  first connected doc-page owns it, an authored meta is never
     *  overridden, removed when no doc-page remains. */
    _syncPrintSizingMeta() {
      const id = 'doc-page-print-sizing';
      const own = document.getElementById(id);
      const authored = document.querySelector('meta[name="omelette-print-sizing"]:not([data-omelette-injected])');
      // A fixed page wins outright (mirroring the fixed-size loop above,
      // so the two metas can never contradict each other in a mixed
      // multi-page document); otherwise the first page's mode holds.
      let mode = null;
      for (const el of document.querySelectorAll('doc-page')) {
        if (typeof el._printSizingMode !== 'function') continue;
        const m = el._printSizingMode();
        if (m === 'fixed') {
          mode = m;
          break;
        }
        if (mode === null) mode = m;
      }
      if (!mode || authored) {
        if (own) own.remove();
        return;
      }
      // A deck-stage that connected first injected its own meta and
      // defers to any existing one — take it over, or the document ends
      // up with two conflicting injected metas (a doc-page page is the
      // document; the deck re-ensures its meta if every doc-page leaves).
      const deckMeta = document.getElementById('deck-stage-print-sizing');
      if (deckMeta) deckMeta.remove();
      const tag = own || document.createElement('meta');
      tag.id = id;
      tag.name = 'omelette-print-sizing';
      tag.content = mode;
      tag.setAttribute('data-omelette-injected', '');
      if (!own) document.head.appendChild(tag);
    }
    _scheduleMeasure() {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => {
        this._raf = null;
        this._measure();
      });
    }

    /** Slot heights feed the print spacers (--doc-hdr-h / --doc-ftr-h), so
     *  they re-measure on content mutation, resize, and font load. The
     *  same pass detects explicit pagination (direct .page children) and
     *  toggles the sheet between the flowing-document card and the
     *  page-per-card stack — content edits can add or remove pages at any
     *  time, so this tracks the same mutations the measurement does. */
    _measure() {
      const hdr = this.querySelector(':scope > [slot="header"]');
      const ftr = this.querySelector(':scope > [slot="footer"]');
      const wasPaginated = this._sheet.classList.contains('paginated');
      this._sheet.classList.toggle('paginated', this.querySelector(':scope > .page') !== null);
      // The WebKit @page margin is flowing-only, so a pagination flip
      // must re-emit the rule (content edits can add or remove .page
      // sections at any time).
      if (this._sheet.classList.contains('paginated') !== wasPaginated) {
        this._syncPrintPageRule();
      }
      this._syncSize(hdr ? hdr.offsetHeight : 0, ftr ? ftr.offsetHeight : 0);
    }
  }
  if (!customElements.get('doc-page')) {
    customElements.define('doc-page', DocPage);
  }
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "doc-page.js", error: String((e && e.message) || e) }); }

// ui_kits/sommeasy/AuthScreen.jsx
try { (() => {
const {
  TextField,
  Button
} = window.SommeasyDesignSystem_0c6415;
function AuthScreen({
  go
}) {
  const [email, setEmail] = React.useState("");
  const [pw, setPw] = React.useState("");
  const [error, setError] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: "100%",
      maxWidth: 400
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      marginBottom: 40
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      go("welcome");
    },
    "aria-label": "Sommeasy home",
    style: {
      textDecoration: "none",
      display: "inline-block"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/protea-icon.png",
    alt: "",
    style: {
      height: 72,
      width: "auto",
      marginBottom: 16,
      filter: "drop-shadow(0 4px 16px rgba(139,35,50,0.12))"
    }
  }), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: KIT_SERIF,
      fontSize: 34,
      color: "#8B2332",
      margin: "0 0 6px 0",
      fontWeight: 700,
      letterSpacing: "-0.01em"
    }
  }, "Sommeasy")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 15,
      color: "#1B3D2F",
      opacity: 0.5,
      margin: 0
    }
  }, "Welcome back \u2014 your palate's been waiting.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(TextField, {
    id: "email",
    label: "Email",
    type: "email",
    value: email,
    onChange: e => setEmail(e.target.value),
    autoComplete: "email",
    autoFocus: true
  }), /*#__PURE__*/React.createElement(TextField, {
    id: "password",
    label: "Password",
    type: "password",
    value: pw,
    onChange: e => setPw(e.target.value),
    autoComplete: "current-password"
  }), error && /*#__PURE__*/React.createElement("div", {
    role: "alert",
    style: {
      padding: "12px 16px",
      borderRadius: 12,
      background: "rgba(139,35,50,0.06)",
      border: "1px solid rgba(139,35,50,0.12)"
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 13,
      color: "#8B2332",
      margin: 0,
      lineHeight: 1.4
    }
  }, "That email and password don't match our books. Give it another try \u2014 or reset your password below if it's slipped your mind.")), /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    fullWidth: true,
    style: {
      marginTop: 4
    },
    onClick: () => {
      if (email && pw) go("home");else setError(true);
    }
  }, "Sign In")), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      marginTop: 22,
      display: "flex",
      flexDirection: "column",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 14,
      color: "#1B3D2F",
      opacity: 0.5
    }
  }, "New here? ", /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.preventDefault(),
    style: {
      color: "#8B2332",
      fontWeight: 600,
      textDecoration: "none"
    }
  }, "Create an account")), /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.preventDefault(),
    style: {
      fontFamily: KIT_SANS,
      fontSize: 13,
      color: "#8B2332",
      fontWeight: 600,
      textDecoration: "none",
      padding: "8px 0"
    }
  }, "Forgot your password?"))));
}
window.AuthScreen = AuthScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sommeasy/AuthScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sommeasy/HomeScreen.jsx
try { (() => {
const {
  AppHeader,
  HeroPanel,
  PromptCard,
  WineRecCard,
  RatingModal,
  Toast,
  PalateMark,
  Button
} = window.SommeasyDesignSystem_0c6415;
function HomeScreen({
  go
}) {
  const [showWines, setShowWines] = React.useState(true);
  const [verdict, setVerdict] = React.useState(true);
  const [ratingWine, setRatingWine] = React.useState(null);
  const [done, setDone] = React.useState({});
  const [toast, setToast] = React.useState(null);
  const [evo, setEvo] = React.useState(null);
  const p = KIT.profile;
  const pop = msg => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };
  const popEvo = msg => setTimeout(() => {
    setEvo(msg);
    setTimeout(() => setEvo(null), 4000);
  }, 1500);
  const act = (wine, type) => {
    if (type === "had") {
      setRatingWine(wine);
      return;
    }
    setDone(d => ({
      ...d,
      [wine]: true
    }));
    pop(type === "want" ? "Added to your list!" : "Removed");
  };
  const rate = r => {
    setDone(d => ({
      ...d,
      [ratingWine]: true
    }));
    setRatingWine(null);
    pop("Noted!");
    if (r === "loved") popEvo("🧬 Your Wine DNA evolved: Vouvray added to your regions");
  };
  const visible = KIT.recs.filter(r => !done[r.wine]);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 560,
      margin: "0 auto",
      padding: "0 24px",
      minHeight: "100vh"
    }
  }, toast && /*#__PURE__*/React.createElement(Toast, {
    check: true,
    fixed: true
  }, toast), evo && /*#__PURE__*/React.createElement(Toast, {
    fixed: true,
    top: toast ? 60 : 16
  }, evo), ratingWine && /*#__PURE__*/React.createElement(RatingModal, {
    wine: ratingWine,
    onRate: rate,
    onClose: () => setRatingWine(null)
  }), /*#__PURE__*/React.createElement(AppHeader, {
    userName: KIT.user.name,
    onSignOut: () => go("welcome"),
    assetBase: "../../assets"
  }), /*#__PURE__*/React.createElement("div", {
    onClick: () => go("recommend"),
    style: {
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement(HeroPanel, {
    eyebrow: "At a restaurant?",
    title: "Get your picks",
    body: "Share a wine list and we'll match it to your DNA",
    capsule: "Paste, snap, or link a menu",
    capsuleIcon: "\uD83D\uDCCB",
    style: {
      marginTop: 8,
      marginBottom: 24
    }
  })), verdict && /*#__PURE__*/React.createElement(PromptCard, {
    accent: "burgundy",
    eyebrow: "\uD83E\uDD42 The table verdict",
    title: "You ordered Hamilton Russell Chardonnay \u2014 how was it?",
    style: {
      marginBottom: 24
    },
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      onClick: () => {
        setVerdict(false);
        setRatingWine("Hamilton Russell Chardonnay 2022");
      },
      style: {
        flex: 1,
        padding: "11px 14px",
        borderRadius: 10,
        border: "none",
        minHeight: 40,
        background: "linear-gradient(135deg, #8B2332, #7A1E2C)",
        color: "#F5F0E8",
        fontFamily: KIT_SANS,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer"
      }
    }, "Rate it"), /*#__PURE__*/React.createElement("button", {
      onClick: () => setVerdict(false),
      style: {
        padding: "11px 18px",
        borderRadius: 10,
        minHeight: 40,
        border: "1px solid rgba(27,61,47,0.1)",
        background: "none",
        fontFamily: KIT_SANS,
        fontSize: 13,
        color: "#1B3D2F",
        opacity: 0.55,
        cursor: "pointer"
      }
    }, "Skip"))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 16,
      padding: "18px 24px",
      borderRadius: "18px 18px 0 0",
      border: "1px solid rgba(27,61,47,0.08)",
      borderBottom: "none",
      background: "rgba(255,255,255,0.5)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 44,
      height: 44,
      borderRadius: 12,
      background: "linear-gradient(135deg, rgba(139,35,50,0.08), rgba(139,35,50,0.04))",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 22,
      flexShrink: 0
    }
  }, "\uD83D\uDCF8"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: KIT_SERIF,
      fontSize: 16,
      color: "#1B3D2F",
      fontWeight: 600,
      lineHeight: 1.3
    }
  }, "Log a Bottle"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 13,
      color: "#1B3D2F",
      opacity: 0.45,
      lineHeight: 1.4,
      marginTop: 2
    }
  }, "Photo a label to add it to your collection"))), /*#__PURE__*/React.createElement("button", {
    onClick: () => pop("Camera opens here"),
    style: {
      width: "100%",
      padding: "13px 8px",
      borderRadius: "0 0 18px 18px",
      border: "1px solid rgba(27,61,47,0.08)",
      borderTop: "none",
      background: "rgba(255,255,255,0.4)",
      cursor: "pointer",
      fontFamily: KIT_SANS,
      fontSize: 13,
      color: "#1B3D2F",
      fontWeight: 500,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6
    }
  }, "\u2B06\uFE0F Upload Photo")), /*#__PURE__*/React.createElement("div", {
    onClick: () => go("palate"),
    style: {
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement(HeroPanel, {
    tone: "forest",
    style: {
      marginBottom: 28
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 14,
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(PalateMark, {
    genome: p.genome,
    size: 44
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: KIT_SERIF,
      fontSize: 20,
      fontWeight: 700,
      lineHeight: 1.2
    }
  }, p.archetype), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: KIT_SERIF,
      fontSize: 13,
      fontStyle: "italic",
      opacity: 0.6,
      marginTop: 4
    }
  }, p.epithet), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 12,
      color: "#C9DAC4",
      marginTop: 6,
      fontWeight: 600
    }
  }, "\uD83E\uDDEC ", p.whisper))), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 22,
      opacity: 0.5,
      flexShrink: 0
    }
  }, "\u203A")))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 28
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowWines(!showWines),
    style: {
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: showWines ? 14 : 0,
      padding: "12px 2px",
      background: "none",
      border: "none",
      cursor: "pointer",
      textAlign: "left"
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: KIT_SERIF,
      fontSize: 20,
      color: "#1B3D2F",
      fontWeight: 600,
      margin: 0
    }
  }, "Wines to Try"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, Object.keys(done).length > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 11,
      color: "#8B2332",
      opacity: 0.6,
      fontWeight: 600
    }
  }, Object.keys(done).length, " reviewed"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 12,
      color: "#1B3D2F",
      opacity: 0.35,
      fontWeight: 500,
      transform: showWines ? "rotate(180deg)" : "rotate(0deg)",
      transition: "transform 0.25s ease",
      display: "inline-block"
    }
  }, "\u25BC"))), showWines && (visible.length > 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, visible.map((rec, i) => /*#__PURE__*/React.createElement(WineRecCard, {
    key: rec.wine,
    index: i,
    wine: rec.wine,
    why: rec.why,
    matchType: rec.matchType,
    onAction: act
  }))) : /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: "32px 20px",
      background: "rgba(255,255,255,0.4)",
      borderRadius: 16,
      border: "1px solid rgba(27,61,47,0.06)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 32,
      marginBottom: 12
    }
  }, "\uD83C\uDF89"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: KIT_SERIF,
      fontSize: 18,
      color: "#1B3D2F",
      marginBottom: 8
    }
  }, "You've reviewed all your wines!"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 14,
      color: "#1B3D2F",
      opacity: 0.5,
      lineHeight: 1.5,
      maxWidth: 300,
      margin: "0 auto 16px"
    }
  }, "Your best picks now come from real menus \u2014 share a wine list and we'll match it to your palate."), /*#__PURE__*/React.createElement(Button, {
    pill: true,
    onClick: () => go("recommend"),
    style: {
      padding: "12px 32px",
      fontSize: 14
    }
  }, "Scan a Wine List")))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      go("journal");
    },
    style: {
      fontFamily: KIT_SANS,
      fontSize: 13,
      color: "#8B2332",
      fontWeight: 600,
      textDecoration: "none",
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "10px 20px",
      borderRadius: 100,
      border: "1px solid rgba(139,35,50,0.12)",
      background: "rgba(139,35,50,0.03)"
    }
  }, "\uD83C\uDF77 Wine Journal \u2192")), /*#__PURE__*/React.createElement("div", {
    style: {
      paddingBottom: 48
    }
  }));
}
window.HomeScreen = HomeScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sommeasy/HomeScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sommeasy/JournalScreen.jsx
try { (() => {
const {
  RatingModal
} = window.SommeasyDesignSystem_0c6415;
const RATING_DISPLAY = {
  loved: {
    emoji: "❤️",
    label: "Loved it"
  },
  liked: {
    emoji: "👍",
    label: "Liked it"
  },
  fine: {
    emoji: "😐",
    label: "It was fine"
  },
  not_for_me: {
    emoji: "👎",
    label: "Not for me"
  }
};
function JournalScreen({
  go
}) {
  const [tab, setTab] = React.useState("tried");
  const [ratingWine, setRatingWine] = React.useState(null);
  const J = KIT.journal;
  const emptyBox = (emoji, text) => /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: "48px 20px",
      background: "rgba(255,255,255,0.4)",
      borderRadius: 16,
      border: "1px solid rgba(27,61,47,0.06)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 36,
      marginBottom: 12
    }
  }, emoji), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 15,
      color: "#1B3D2F",
      opacity: 0.5,
      margin: 0,
      lineHeight: 1.5
    }
  }, text));
  const wineRow = (w, showRating) => /*#__PURE__*/React.createElement("div", {
    key: w.name,
    style: {
      background: "rgba(255,255,255,0.55)",
      borderRadius: 16,
      padding: "18px 20px",
      border: "1px solid rgba(27,61,47,0.06)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: KIT_SERIF,
      fontSize: 16,
      color: "#1B3D2F",
      lineHeight: 1.35,
      marginBottom: 6
    }
  }, w.name), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap"
    }
  }, showRating && w.rating && /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "3px 10px",
      borderRadius: 100,
      background: w.rating === "loved" ? "rgba(139,35,50,0.08)" : w.rating === "not_for_me" ? "rgba(27,61,47,0.06)" : "rgba(27,61,47,0.04)",
      fontFamily: KIT_SANS,
      fontSize: 12,
      color: w.rating === "loved" ? "#8B2332" : "#1B3D2F",
      fontWeight: 600
    }
  }, RATING_DISPLAY[w.rating].emoji, " ", RATING_DISPLAY[w.rating].label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 11,
      color: "#1B3D2F",
      opacity: 0.3
    }
  }, w.date)), w.somm && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      padding: "12px 14px",
      borderRadius: 10,
      background: "#F5F0E8",
      borderLeft: "3px solid #8B2332"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap",
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 11,
      fontWeight: 700,
      color: "#8B2332",
      textTransform: "uppercase",
      letterSpacing: "0.08em"
    }
  }, "\uD83C\uDF77 The Somm said"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 10,
      fontWeight: 700,
      color: "#8B2332",
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      background: "rgba(139,35,50,0.08)",
      padding: "2px 8px",
      borderRadius: 100
    }
  }, "\uD83D\uDCB0 Great Value")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: KIT_SERIF,
      fontSize: 14,
      fontStyle: "italic",
      color: "#1B3D2F",
      margin: 0,
      lineHeight: 1.55
    }
  }, w.somm.note), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 12,
      color: "#1B3D2F",
      opacity: 0.5,
      marginTop: 6
    }
  }, "That night: ", w.somm.occasion))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexShrink: 0
    }
  }, showRating && /*#__PURE__*/React.createElement("button", {
    onClick: () => setRatingWine(w.name),
    style: {
      fontFamily: KIT_SANS,
      fontSize: 13,
      color: "#8B2332",
      background: "none",
      border: "1px solid rgba(139,35,50,0.15)",
      borderRadius: 8,
      padding: "10px 14px",
      cursor: "pointer"
    }
  }, "Edit"), /*#__PURE__*/React.createElement("button", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 13,
      color: "#1B3D2F",
      opacity: 0.35,
      background: "none",
      border: "1px solid rgba(27,61,47,0.08)",
      borderRadius: 8,
      padding: "10px 14px",
      cursor: "pointer"
    }
  }, "\xD7"))));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 560,
      margin: "0 auto",
      padding: "0 24px",
      minHeight: "100vh"
    }
  }, ratingWine && /*#__PURE__*/React.createElement(RatingModal, {
    wine: ratingWine,
    onRate: () => setRatingWine(null),
    onClose: () => setRatingWine(null)
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "16px 0",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      position: "sticky",
      top: 0,
      background: "rgba(245,240,232,0.92)",
      backdropFilter: "blur(16px)",
      zIndex: 10
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      go("home");
    },
    style: {
      fontFamily: KIT_SERIF,
      fontSize: 22,
      color: "#8B2332",
      fontWeight: 700,
      textDecoration: "none",
      display: "flex",
      alignItems: "center",
      gap: 10,
      letterSpacing: "-0.01em"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/protea-icon.png",
    alt: "",
    style: {
      height: 36,
      width: "auto"
    }
  }), "Sommeasy"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      go("home");
    },
    style: {
      fontFamily: KIT_SANS,
      fontSize: 13,
      color: "#1B3D2F",
      opacity: 0.5,
      textDecoration: "none"
    }
  }, "\u2039 Home")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "24px 0 20px"
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: KIT_SERIF,
      fontSize: 30,
      color: "#1B3D2F",
      margin: "0 0 8px",
      fontWeight: 700,
      letterSpacing: "-0.01em"
    }
  }, "Wine Journal"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 15,
      color: "#1B3D2F",
      opacity: 0.5,
      margin: 0,
      lineHeight: 1.5
    }
  }, "Your tasting history and wishlist")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 4,
      marginBottom: 20,
      background: "rgba(27,61,47,0.04)",
      borderRadius: 14,
      padding: 4
    }
  }, [{
    id: "tried",
    label: `Tried (${J.tried.length})`
  }, {
    id: "want",
    label: `Want to Try (${J.want.length})`
  }, {
    id: "skipped",
    label: `Skipped (${J.skipped.length})`
  }, {
    id: "timeline",
    label: "DNA Timeline"
  }].map(t => /*#__PURE__*/React.createElement("button", {
    key: t.id,
    onClick: () => setTab(t.id),
    style: {
      flex: 1,
      padding: "11px 8px",
      borderRadius: 11,
      border: "none",
      background: tab === t.id ? "rgba(255,255,255,0.85)" : "transparent",
      color: "#1B3D2F",
      fontFamily: KIT_SANS,
      fontSize: 13,
      fontWeight: tab === t.id ? 600 : 400,
      cursor: "pointer",
      transition: "all 0.2s ease",
      boxShadow: tab === t.id ? "0 1px 4px rgba(0,0,0,0.06)" : "none"
    }
  }, t.label))), tab === "tried" && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, J.tried.map(w => wineRow(w, true))), tab === "want" && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, J.want.map(w => wineRow(w, false))), tab === "skipped" && (J.skipped.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, J.skipped.map(w => wineRow(w, false))) : emptyBox("👋", "Nothing skipped yet.")), tab === "timeline" && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, J.timeline.map(e => /*#__PURE__*/React.createElement("div", {
    key: e.text,
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      background: "rgba(255,255,255,0.55)",
      borderRadius: 14,
      padding: "14px 18px",
      border: "1px solid rgba(27,61,47,0.06)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 14,
      color: "#1B3D2F",
      lineHeight: 1.4,
      fontWeight: e.shifted ? 600 : 400
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      marginRight: 8
    }
  }, e.glyph), e.text), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 11,
      color: "#1B3D2F",
      opacity: 0.3,
      flexShrink: 0,
      whiteSpace: "nowrap"
    }
  }, e.date)))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      go("palate");
    },
    style: {
      fontFamily: KIT_SANS,
      fontSize: 13,
      color: "#8B2332",
      fontWeight: 600,
      textDecoration: "none",
      display: "inline-block",
      padding: "10px 20px",
      borderRadius: 100,
      border: "1px solid rgba(139,35,50,0.12)",
      background: "rgba(139,35,50,0.03)"
    }
  }, "\uD83E\uDDEC See what's building in your palate \u2192"))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 28,
      padding: "18px 20px",
      borderRadius: 16,
      background: "rgba(255,255,255,0.4)",
      border: "1px solid rgba(27,61,47,0.06)"
    }
  }, kitLabel("Your Stats"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 16,
      flexWrap: "wrap"
    }
  }, [{
    n: J.tried.length,
    l: "Wines Tried"
  }, {
    n: J.tried.filter(w => w.rating === "loved").length,
    l: "Loved"
  }, {
    n: J.want.length,
    l: "Wishlist"
  }].map(s => /*#__PURE__*/React.createElement("div", {
    key: s.l,
    style: {
      textAlign: "center",
      flex: 1,
      minWidth: 70
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: KIT_SERIF,
      fontSize: 24,
      fontWeight: 700,
      color: "#1B3D2F"
    }
  }, s.n), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 11,
      color: "#1B3D2F",
      opacity: 0.4,
      marginTop: 2
    }
  }, s.l))))), /*#__PURE__*/React.createElement("div", {
    style: {
      paddingBottom: 48
    }
  }));
}
window.JournalScreen = JournalScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sommeasy/JournalScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sommeasy/PalateScreen.jsx
try { (() => {
const {
  PalateMark,
  SignatureRail,
  BuildingBar,
  Chip,
  Card,
  SectionLabel
} = window.SommeasyDesignSystem_0c6415;
function PalateScreen({
  go
}) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);
  const p = KIT.profile;
  const card = {
    marginBottom: 12
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 560,
      margin: "0 auto",
      padding: "0 24px",
      minHeight: "100vh"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "16px 0",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      position: "sticky",
      top: 0,
      background: "rgba(245,240,232,0.92)",
      backdropFilter: "blur(16px)",
      zIndex: 10
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      go("home");
    },
    style: {
      fontFamily: KIT_SERIF,
      fontSize: 22,
      color: "#8B2332",
      fontWeight: 700,
      textDecoration: "none",
      display: "flex",
      alignItems: "center",
      gap: 10,
      letterSpacing: "-0.01em"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/protea-icon.png",
    alt: "",
    style: {
      height: 36,
      width: "auto"
    }
  }), "Sommeasy"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      go("home");
    },
    style: {
      fontFamily: KIT_SANS,
      fontSize: 13,
      color: "#1B3D2F",
      opacity: 0.5,
      textDecoration: "none"
    }
  }, "\u2039 Home")), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: "30px 0 24px"
    }
  }, /*#__PURE__*/React.createElement(PalateMark, {
    genome: p.genome,
    size: 192,
    style: {
      marginBottom: 18
    }
  }), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: KIT_SERIF,
      fontSize: 32,
      color: "#1B3D2F",
      margin: "0 0 8px",
      fontWeight: 700,
      letterSpacing: "-0.01em"
    }
  }, p.archetype), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: KIT_SERIF,
      fontSize: 15,
      fontStyle: "italic",
      color: "#8B2332",
      margin: 0,
      opacity: 0.85
    }
  }, p.epithet)), /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#F5F0E8",
      borderRadius: 16,
      marginBottom: 12,
      border: "1px solid rgba(139,35,50,0.14)",
      padding: "22px 24px 16px",
      boxShadow: "0 2px 12px rgba(139,35,50,0.05)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: "0.22em",
      color: "#8B2332",
      fontWeight: 700
    }
  }, "Palate Signature"), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 44,
      height: 1,
      background: "rgba(139,35,50,0.25)",
      margin: "10px auto 0"
    }
  })), /*#__PURE__*/React.createElement(SignatureRail, {
    leftLabel: "Old World",
    rightLabel: "New World",
    position: p.signature.oldNew,
    mounted: mounted,
    delay: 0
  }), /*#__PURE__*/React.createElement(SignatureRail, {
    leftLabel: "Focused",
    rightLabel: "Wide-ranging",
    position: p.signature.focus,
    mounted: mounted,
    delay: 140
  }), /*#__PURE__*/React.createElement(SignatureRail, {
    leftLabel: "Red",
    rightLabel: "White",
    position: p.signature.redWhite,
    mounted: mounted,
    delay: 280
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: KIT_SERIF,
      fontSize: 15,
      fontStyle: "italic",
      color: "#1B3D2F",
      textAlign: "center",
      margin: "4px 0 6px",
      lineHeight: 1.5
    }
  }, p.signature.phrase)), /*#__PURE__*/React.createElement(Card, {
    style: card
  }, kitLabel("In the Somm's words"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 15,
      color: "#1B3D2F",
      opacity: 0.65,
      lineHeight: 1.65,
      margin: 0,
      fontStyle: "italic"
    }
  }, p.narrative)), /*#__PURE__*/React.createElement(Card, {
    level: "quiet",
    style: card
  }, kitLabel("Recently evolved"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, KIT.journal.timeline.slice(0, 2).map(e => /*#__PURE__*/React.createElement("div", {
    key: e.text,
    style: {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: KIT_SERIF,
      fontSize: 14,
      color: "#1B3D2F",
      lineHeight: 1.45,
      fontWeight: e.shifted ? 600 : 400
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      marginRight: 8
    }
  }, e.glyph), e.shifted ? e.text : `${e.text.split(" added")[0]} earned its place — two bottles made the case`), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 11,
      color: "#1B3D2F",
      opacity: 0.3,
      flexShrink: 0,
      whiteSpace: "nowrap"
    }
  }, e.date))), /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      go("journal");
    },
    style: {
      fontFamily: KIT_SANS,
      fontSize: 12,
      color: "#8B2332",
      fontWeight: 600,
      textDecoration: "none",
      marginTop: 4,
      padding: "8px 0",
      display: "inline-block"
    }
  }, "Full history \u2192"))), /*#__PURE__*/React.createElement(Card, {
    level: "quiet",
    style: card
  }, kitLabel("Building now"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 14
    }
  }, KIT.building.map((b, i) => /*#__PURE__*/React.createElement(BuildingBar, {
    key: b.name,
    name: b.name,
    dimension: b.dimension,
    away: b.away,
    ratio: b.ratio,
    mounted: mounted,
    delay: 200 + i * 90
  })))), /*#__PURE__*/React.createElement(Card, {
    level: "quiet",
    style: card
  }, kitLabel("Countries"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 6
    }
  }, KIT.dna.countries.map(c => /*#__PURE__*/React.createElement(Chip, {
    key: c.label,
    label: c.label,
    earned: c.earned
  })))), /*#__PURE__*/React.createElement(Card, {
    level: "quiet",
    style: card
  }, kitLabel("Regions"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, KIT.dna.regions.map(g => /*#__PURE__*/React.createElement("div", {
    key: g.heading
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 12,
      fontWeight: 600,
      color: "#1B3D2F",
      opacity: 0.55,
      marginBottom: 6
    }
  }, g.heading), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 6
    }
  }, g.items.map(c => /*#__PURE__*/React.createElement(Chip, {
    key: c.label,
    label: c.label,
    earned: c.earned
  }))))))), /*#__PURE__*/React.createElement(Card, {
    level: "quiet",
    style: card
  }, kitLabel("Grapes"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 6
    }
  }, KIT.dna.grapes.map(c => /*#__PURE__*/React.createElement(Chip, {
    key: c.label,
    label: c.label,
    earned: c.earned
  })))), /*#__PURE__*/React.createElement(Card, {
    level: "quiet",
    style: card
  }, kitLabel("Estates"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, KIT.dna.estates.map(g => /*#__PURE__*/React.createElement("div", {
    key: g.heading
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 12,
      fontWeight: 600,
      color: "#1B3D2F",
      opacity: 0.55,
      marginBottom: 6
    }
  }, g.heading), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 6
    }
  }, g.items.map(c => /*#__PURE__*/React.createElement(Chip, {
    key: c.label,
    label: c.label,
    earned: c.earned
  }))))))), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 12,
      color: "#1B3D2F",
      opacity: 0.45,
      margin: "2px 4px 0"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "#8B2332"
    }
  }, "\u2726"), " earned by your ratings, not the quiz"), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      marginTop: 28,
      paddingBottom: 48,
      display: "flex",
      justifyContent: "center",
      gap: 8,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.preventDefault(),
    style: {
      fontFamily: KIT_SANS,
      fontSize: 13,
      color: "#1B3D2F",
      opacity: 0.35,
      textDecoration: "underline",
      padding: "12px 10px"
    }
  }, "Adjust quiz answers"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.preventDefault(),
    style: {
      fontFamily: KIT_SANS,
      fontSize: 13,
      color: "#1B3D2F",
      opacity: 0.35,
      textDecoration: "underline",
      padding: "12px 10px"
    }
  }, "Start fresh")));
}
window.PalateScreen = PalateScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sommeasy/PalateScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sommeasy/RecommendScreen.jsx
try { (() => {
const {
  RatingModal,
  Toast
} = window.SommeasyDesignSystem_0c6415;
const PICK_TYPE_INFO = {
  top: {
    label: "Top Pick",
    emoji: "🏆",
    color: "#8B2332",
    bg: "rgba(139,35,50,0.1)"
  },
  splurge: {
    label: "Splurge",
    emoji: "✨",
    color: "#1B3D2F",
    bg: "rgba(27,61,47,0.08)"
  },
  value: {
    label: "Great Value",
    emoji: "💰",
    color: "#6B8F5E",
    bg: "rgba(107,143,94,0.1)"
  },
  adventure: {
    label: "Adventure",
    emoji: "🧭",
    color: "#8B6914",
    bg: "rgba(139,105,20,0.08)"
  },
  wildcard: {
    label: "Worth Trying",
    emoji: "🍷",
    color: "#1B3D2F",
    bg: "rgba(27,61,47,0.05)"
  }
};
const COLOR_OPTIONS = [{
  id: "all",
  label: "All wines"
}, {
  id: "red",
  label: "Red"
}, {
  id: "white",
  label: "White"
}];
const recInput = {
  width: "100%",
  padding: "11px 10px 11px 22px",
  borderRadius: 8,
  border: "1px solid rgba(27,61,47,0.1)",
  background: "rgba(255,255,255,0.8)",
  fontFamily: "'Source Sans 3', sans-serif",
  fontSize: 16,
  color: "#1B3D2F",
  outline: "none",
  boxSizing: "border-box"
};
function RecFilters({
  colorPref,
  setColorPref,
  steer,
  setSteer,
  showAskAgain
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "rgba(255,255,255,0.5)",
      borderRadius: 16,
      padding: 16,
      border: "1px solid rgba(27,61,47,0.08)",
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      marginBottom: 12
    }
  }, COLOR_OPTIONS.map(opt => /*#__PURE__*/React.createElement("button", {
    key: opt.id,
    onClick: () => setColorPref(opt.id),
    style: {
      flex: 1,
      padding: "8px 4px",
      borderRadius: 10,
      cursor: "pointer",
      border: colorPref === opt.id ? "2px solid #1B3D2F" : "2px solid rgba(27,61,47,0.1)",
      background: colorPref === opt.id ? "rgba(27,61,47,0.06)" : "transparent",
      fontFamily: KIT_SANS,
      fontSize: 13,
      fontWeight: colorPref === opt.id ? 600 : 400,
      color: "#1B3D2F"
    }
  }, opt.label))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      left: 10,
      top: "50%",
      transform: "translateY(-50%)",
      fontFamily: KIT_SANS,
      fontSize: 14,
      color: "#1B3D2F",
      opacity: 0.4
    }
  }, "$"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    placeholder: "Min",
    style: recInput
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 12,
      color: "#1B3D2F",
      opacity: 0.3
    }
  }, "to"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      left: 10,
      top: "50%",
      transform: "translateY(-50%)",
      fontFamily: KIT_SANS,
      fontSize: 14,
      color: "#1B3D2F",
      opacity: 0.4
    }
  }, "$"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    placeholder: "Max",
    style: recInput
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      display: "block",
      fontFamily: KIT_SANS,
      fontSize: 11,
      fontWeight: 600,
      color: "#1B3D2F",
      opacity: 0.55,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      margin: "0 0 6px 2px"
    }
  }, "Steer the Somm ", /*#__PURE__*/React.createElement("span", {
    style: {
      textTransform: "none",
      letterSpacing: 0,
      fontWeight: 400
    }
  }, "(optional)")), /*#__PURE__*/React.createElement("input", {
    type: "text",
    maxLength: 200,
    value: steer,
    onChange: e => setSteer(e.target.value),
    placeholder: "A grape, a place, a mood\u2026",
    style: {
      ...recInput,
      padding: 12
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 12,
      color: "#1B3D2F",
      opacity: 0.45,
      margin: "6px 2px 0",
      lineHeight: 1.5
    }
  }, "Try \"something South African\", \"no Chardonnay\", or \"big reds for a steak night\".")), showAskAgain && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: {
      padding: "8px 18px",
      borderRadius: 100,
      border: "1px solid rgba(139,35,50,0.2)",
      background: "rgba(255,255,255,0.7)",
      color: "#8B2332",
      fontFamily: KIT_SANS,
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer"
    }
  }, "\uD83C\uDF77 Ask the Somm again")));
}
function RecommendScreen({
  go,
  initialView
}) {
  const [view, setView] = React.useState(initialView || "input"); // input | results
  const [colorPref, setColorPref] = React.useState("all");
  const [steer, setSteer] = React.useState("");
  const [menuUrl, setMenuUrl] = React.useState("");
  const [chosen, setChosen] = React.useState(null);
  const [ratings, setRatings] = React.useState({});
  const [ratingPick, setRatingPick] = React.useState(null);
  const [bypass, setBypass] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const pop = m => {
    setToast(m);
    setTimeout(() => setToast(null), 2500);
  };
  const header = /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "16px 0",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      position: "sticky",
      top: 0,
      background: "rgba(245,240,232,0.92)",
      backdropFilter: "blur(16px)",
      zIndex: 10
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      go("home");
    },
    style: {
      fontFamily: KIT_SERIF,
      fontSize: 22,
      color: "#8B2332",
      fontWeight: 700,
      textDecoration: "none",
      display: "flex",
      alignItems: "center",
      gap: 10,
      letterSpacing: "-0.01em"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/protea-icon.png",
    alt: "",
    style: {
      height: 36,
      width: "auto"
    }
  }), "Sommeasy"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 13,
      color: "#1B3D2F",
      opacity: 0.5
    }
  }, KIT.user.name));
  if (view === "results") return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 520,
      margin: "0 auto",
      padding: "0 20px",
      minHeight: "100vh"
    }
  }, toast && /*#__PURE__*/React.createElement(Toast, {
    fixed: true
  }, toast), ratingPick && /*#__PURE__*/React.createElement(RatingModal, {
    eyebrow: "How was it?",
    wine: ratingPick,
    onRate: r => {
      setRatings(x => ({
        ...x,
        [ratingPick]: r
      }));
      setRatingPick(null);
      pop("✓ Rating saved!");
    },
    onClose: () => setRatingPick(null)
  }), header, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: "28px 0 20px"
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: KIT_SERIF,
      fontSize: 30,
      color: "#1B3D2F",
      margin: "0 0 10px",
      fontWeight: 700,
      letterSpacing: "-0.01em"
    }
  }, "Your picks"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 14,
      color: "#1B3D2F",
      opacity: 0.45,
      margin: 0,
      lineHeight: 1.5
    }
  }, "42 wines \u2014 here's where to start")), /*#__PURE__*/React.createElement(RecFilters, {
    colorPref: colorPref,
    setColorPref: setColorPref,
    steer: steer,
    setSteer: setSteer,
    showAskAgain: true
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 13,
      color: "#1B3D2F",
      opacity: 0.45,
      margin: 0,
      lineHeight: 1.8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      whiteSpace: "nowrap"
    }
  }, "\uD83C\uDFC6 Top Pick"), "  \xB7  ", /*#__PURE__*/React.createElement("span", {
    style: {
      whiteSpace: "nowrap"
    }
  }, "\u2728 Splurge"), "  \xB7  ", /*#__PURE__*/React.createElement("span", {
    style: {
      whiteSpace: "nowrap"
    }
  }, "\uD83D\uDCB0 Great Value"), "  \xB7  ", /*#__PURE__*/React.createElement("span", {
    style: {
      whiteSpace: "nowrap"
    }
  }, "\uD83E\uDDED Adventure"), "  \xB7  ", /*#__PURE__*/React.createElement("span", {
    style: {
      whiteSpace: "nowrap"
    }
  }, "\uD83C\uDF77 Worth Trying"))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "16px 20px",
      borderRadius: 14,
      marginBottom: 16,
      background: "#F5F0E8",
      border: "1px solid rgba(139,35,50,0.12)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 11,
      fontWeight: 700,
      color: "#8B2332",
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      marginBottom: 6
    }
  }, "\uD83C\uDF77 The Somm says"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: KIT_SERIF,
      fontSize: 15,
      fontStyle: "italic",
      color: "#1B3D2F",
      margin: 0,
      lineHeight: 1.55
    }
  }, KIT.sommSummary)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12,
      marginBottom: 32
    }
  }, KIT.picks.map((pick, i) => {
    const t = PICK_TYPE_INFO[pick.pickType];
    return /*#__PURE__*/React.createElement("div", {
      key: pick.name,
      style: {
        background: "rgba(255,255,255,0.7)",
        borderRadius: 18,
        padding: 20,
        border: "1px solid rgba(27,61,47,0.08)",
        position: "relative",
        overflow: "hidden",
        boxShadow: i === 0 ? "0 4px 20px rgba(139,35,50,0.12)" : "0 2px 8px rgba(0,0,0,0.04)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 12px",
        borderRadius: 100,
        background: t.bg,
        color: t.color,
        fontFamily: KIT_SANS,
        fontSize: 12,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.08em"
      }
    }, /*#__PURE__*/React.createElement("span", null, t.emoji), /*#__PURE__*/React.createElement("span", null, t.label)), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: KIT_SANS,
        fontSize: 18,
        fontWeight: 700,
        color: "#1B3D2F"
      }
    }, "$", pick.price)), /*#__PURE__*/React.createElement("h3", {
      style: {
        fontFamily: KIT_SERIF,
        fontSize: i === 0 ? 20 : 17,
        color: "#1B3D2F",
        margin: "0 0 10px",
        lineHeight: 1.3,
        fontWeight: 600
      }
    }, pick.name), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: KIT_SANS,
        fontSize: 12,
        color: "#1B3D2F",
        opacity: 0.6,
        background: "rgba(27,61,47,0.04)",
        padding: "3px 10px",
        borderRadius: 100
      }
    }, pick.country), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: KIT_SANS,
        fontSize: 12,
        color: "#1B3D2F",
        opacity: 0.6,
        background: "rgba(27,61,47,0.04)",
        padding: "3px 10px",
        borderRadius: 100
      }
    }, pick.varietal)), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 12,
        padding: "12px 14px",
        borderRadius: 10,
        background: "#F5F0E8",
        borderLeft: "3px solid #8B2332"
      }
    }, /*#__PURE__*/React.createElement("p", {
      style: {
        fontFamily: KIT_SERIF,
        fontSize: 14,
        color: "#1B3D2F",
        margin: 0,
        lineHeight: 1.55
      }
    }, pick.note)), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 14,
        paddingTop: 14,
        borderTop: "1px solid rgba(27,61,47,0.06)"
      }
    }, chosen === pick.name ? /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "11px 14px",
        borderRadius: 10,
        marginBottom: 8,
        background: "linear-gradient(135deg, #8B2332, #7A1E2C)",
        color: "#F5F0E8",
        fontFamily: KIT_SANS,
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: "0.02em",
        boxShadow: "0 4px 14px rgba(139,35,50,0.25)"
      }
    }, "\uD83E\uDD42 On the table tonight") : /*#__PURE__*/React.createElement("button", {
      onClick: () => {
        setChosen(pick.name);
        pop("🥂 Noted — enjoy it");
      },
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "10px 14px",
        borderRadius: 10,
        marginBottom: 8,
        minHeight: 40,
        border: "1px solid rgba(27,61,47,0.14)",
        background: "rgba(27,61,47,0.03)",
        fontFamily: KIT_SANS,
        fontSize: 12,
        color: "#1B3D2F",
        fontWeight: 600,
        cursor: "pointer",
        width: "100%"
      }
    }, "\uD83E\uDD42 This one's on the table"), ratings[pick.name] ? /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontFamily: KIT_SANS,
        fontSize: 13,
        color: "#1B3D2F",
        opacity: 0.6
      }
    }, /*#__PURE__*/React.createElement("span", null, {
      loved: "❤️",
      liked: "👍",
      fine: "😐",
      not_for_me: "👎"
    }[ratings[pick.name]]), /*#__PURE__*/React.createElement("span", null, {
      loved: "Loved it",
      liked: "Liked it",
      fine: "It was fine",
      not_for_me: "Not for me"
    }[ratings[pick.name]]), /*#__PURE__*/React.createElement("button", {
      onClick: () => setRatingPick(pick.name),
      style: {
        fontFamily: KIT_SANS,
        fontSize: 11,
        color: "#8B2332",
        background: "none",
        border: "none",
        cursor: "pointer",
        marginLeft: "auto",
        textDecoration: "underline",
        opacity: 0.6
      }
    }, "Change")) : /*#__PURE__*/React.createElement("button", {
      onClick: () => setRatingPick(pick.name),
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 14px",
        borderRadius: 10,
        border: "1px solid rgba(139,35,50,0.12)",
        background: "rgba(139,35,50,0.03)",
        fontFamily: KIT_SANS,
        fontSize: 12,
        color: "#8B2332",
        fontWeight: 600,
        cursor: "pointer",
        width: "100%",
        justifyContent: "center"
      }
    }, "Had this wine? Rate it")));
  })), bypass === null && /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      marginBottom: 28
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setBypass("noted"),
    style: {
      fontFamily: KIT_SANS,
      fontSize: 13,
      color: "#1B3D2F",
      opacity: 0.45,
      background: "none",
      border: "none",
      cursor: "pointer",
      textDecoration: "underline",
      padding: "10px 16px"
    }
  }, "We went a different way tonight")), bypass === "noted" && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "18px 20px",
      borderRadius: 14,
      marginBottom: 28,
      background: "#F5F0E8",
      border: "1px solid rgba(139,35,50,0.12)"
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: KIT_SERIF,
      fontSize: 15,
      fontStyle: "italic",
      color: "#1B3D2F",
      margin: "0 0 14px",
      lineHeight: 1.55
    }
  }, "Fair enough \u2014 the table calls it. Log what you drank and your palate still gets the night."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      go("home");
    },
    style: {
      flex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      padding: "12px 14px",
      borderRadius: 10,
      textDecoration: "none",
      background: "linear-gradient(135deg, #8B2332, #7A1E2C)",
      color: "#F5F0E8",
      fontFamily: KIT_SANS,
      fontSize: 13,
      fontWeight: 600
    }
  }, "\uD83D\uDCF8 Log what you drank"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setBypass("dismissed"),
    style: {
      padding: "12px 18px",
      borderRadius: 10,
      border: "1px solid rgba(27,61,47,0.1)",
      background: "none",
      fontFamily: KIT_SANS,
      fontSize: 13,
      color: "#1B3D2F",
      opacity: 0.55,
      cursor: "pointer"
    }
  }, "Skip"))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      marginBottom: 40
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setView("input"),
    style: {
      padding: "14px 40px",
      borderRadius: 14,
      border: "2px solid rgba(27,61,47,0.15)",
      background: "rgba(255,255,255,0.7)",
      color: "#1B3D2F",
      fontFamily: KIT_SANS,
      fontSize: 14,
      fontWeight: 600,
      cursor: "pointer"
    }
  }, "Scan Again")));
  // INPUT VIEW
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 520,
      margin: "0 auto",
      padding: "0 20px",
      minHeight: "100vh"
    }
  }, header, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: "32px 0 28px"
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: KIT_SERIF,
      fontSize: 30,
      color: "#1B3D2F",
      margin: "0 0 10px",
      fontWeight: 700,
      letterSpacing: "-0.01em"
    }
  }, "Get your picks"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 15,
      color: "#1B3D2F",
      opacity: 0.5,
      margin: 0,
      maxWidth: 340,
      marginLeft: "auto",
      marginRight: "auto",
      lineHeight: 1.5
    }
  }, "Share a wine list and we'll find your best matches.")), /*#__PURE__*/React.createElement(RecFilters, {
    colorPref: colorPref,
    setColorPref: setColorPref,
    steer: steer,
    setSteer: setSteer
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 14,
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setView("results"),
    style: {
      width: "100%",
      padding: "32px 24px",
      borderRadius: 18,
      border: "2px solid rgba(139,35,50,0.15)",
      background: "rgba(255,255,255,0.7)",
      cursor: "pointer",
      textAlign: "center",
      boxShadow: "0 4px 16px rgba(139,35,50,0.08)",
      transition: "all 0.15s ease"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 36,
      marginBottom: 12
    }
  }, "\uD83D\uDCF8"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: KIT_SERIF,
      fontSize: 22,
      color: "#1B3D2F",
      fontWeight: 700,
      marginBottom: 6
    }
  }, "Scan the List"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 14,
      color: "#1B3D2F",
      opacity: 0.5,
      lineHeight: 1.4
    }
  }, "Take a photo or upload a picture of the wine list")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "28px 24px",
      borderRadius: 18,
      border: "1px solid rgba(27,61,47,0.08)",
      background: "rgba(255,255,255,0.55)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 24
    }
  }, "\uD83D\uDD17"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: KIT_SERIF,
      fontSize: 18,
      color: "#1B3D2F",
      fontWeight: 700
    }
  }, "Paste a Link"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 13,
      color: "#1B3D2F",
      opacity: 0.5
    }
  }, "Got a link to the wine list? Drop it here"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "url",
    value: menuUrl,
    onChange: e => setMenuUrl(e.target.value),
    placeholder: "https://...",
    style: {
      flex: 1,
      minWidth: 0,
      padding: "14px 16px",
      borderRadius: 12,
      border: "2px solid rgba(27,61,47,0.1)",
      background: "rgba(255,255,255,0.7)",
      fontFamily: KIT_SANS,
      fontSize: 16,
      color: "#1B3D2F",
      outline: "none",
      boxSizing: "border-box"
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => menuUrl.trim() && setView("results"),
    disabled: !menuUrl.trim(),
    style: {
      padding: "14px 24px",
      borderRadius: 12,
      border: "none",
      background: menuUrl.trim() ? "linear-gradient(135deg, #8B2332, #7A1E2C)" : "rgba(139,35,50,0.15)",
      color: menuUrl.trim() ? "#F5F0E8" : "rgba(139,35,50,0.3)",
      fontFamily: KIT_SANS,
      fontSize: 14,
      fontWeight: 600,
      cursor: menuUrl.trim() ? "pointer" : "default",
      whiteSpace: "nowrap",
      boxShadow: menuUrl.trim() ? "0 4px 16px rgba(139,35,50,0.2)" : "none"
    }
  }, "Get My Picks"))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setView("results"),
    style: {
      fontFamily: KIT_SANS,
      fontSize: 13,
      color: "#1B3D2F",
      opacity: 0.35,
      background: "none",
      border: "none",
      cursor: "pointer",
      textDecoration: "underline",
      padding: "12px 16px"
    }
  }, "or paste text manually"))));
}
window.RecommendScreen = RecommendScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sommeasy/RecommendScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sommeasy/WelcomeScreen.jsx
try { (() => {
const {
  Button,
  StepCard
} = window.SommeasyDesignSystem_0c6415;
function WelcomeScreen({
  go
}) {
  const steps = [{
    n: "1",
    title: "Build your Wine DNA",
    body: "A 2-minute quiz about the wines, regions, and grapes you love."
  }, {
    n: "2",
    title: "Share the wine list",
    body: "Paste it, snap a photo, or drop in a URL from the restaurant's site."
  }, {
    n: "3",
    title: "Get your picks",
    body: "We match what's on the menu to your taste and surface your best options."
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      minHeight: "100vh",
      padding: "48px 24px 56px",
      textAlign: "center",
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 16,
      right: 20
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => go("auth"),
    style: {
      fontFamily: KIT_SANS,
      fontSize: 13,
      color: "#1B3D2F",
      background: "none",
      border: "1px solid rgba(27,61,47,0.15)",
      borderRadius: 100,
      padding: "6px 16px",
      cursor: "pointer",
      opacity: 0.5
    }
  }, "Sign In")), /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo.png",
    alt: "Sommeasy",
    style: {
      height: 200,
      width: "auto",
      marginBottom: 32,
      filter: "drop-shadow(0 8px 24px rgba(139,35,50,0.12))"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 380,
      margin: "0 auto 40px"
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: KIT_SERIF,
      fontSize: 26,
      color: "#1B3D2F",
      lineHeight: 1.35,
      margin: "0 0 14px 0",
      letterSpacing: "-0.01em"
    }
  }, "Never guess at a wine list again."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 16,
      color: "#1B3D2F",
      lineHeight: 1.65,
      margin: 0,
      opacity: 0.65
    }
  }, "Tell us what you like. We'll find it on the menu.")), /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    pill: true,
    onClick: () => go("home")
  }, "Build My Profile"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 14,
      color: "#1B3D2F",
      opacity: 0.45,
      marginTop: 20
    }
  }, "Already have an account? ", /*#__PURE__*/React.createElement("a", {
    onClick: e => {
      e.preventDefault();
      go("auth");
    },
    href: "#",
    style: {
      color: "#8B2332",
      fontWeight: 600
    }
  }, "Sign in")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 13,
      color: "#1B3D2F",
      opacity: 0.3,
      marginTop: 10,
      marginBottom: 48
    }
  }, "Takes about 2 minutes"), /*#__PURE__*/React.createElement("div", {
    style: {
      width: "100%",
      maxWidth: 420,
      textAlign: "left"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: KIT_SANS,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: "0.18em",
      color: "#1B3D2F",
      opacity: 0.35,
      fontWeight: 600,
      textAlign: "center",
      marginBottom: 20
    }
  }, "How it works"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, steps.map(s => /*#__PURE__*/React.createElement(StepCard, {
    key: s.n,
    n: s.n,
    title: s.title,
    body: s.body
  })))));
}
window.WelcomeScreen = WelcomeScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sommeasy/WelcomeScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sommeasy/app.jsx
try { (() => {
const SCREENS = {
  welcome: "Welcome",
  auth: "Sign In",
  home: "Home",
  recommend: "Recommend",
  palate: "Palate",
  journal: "Journal"
};
function KitApp() {
  const [screen, setScreen] = React.useState(() => (location.hash || "#home").slice(1) in SCREENS ? (location.hash || "#home").slice(1) : "home");
  const go = s => {
    setScreen(s);
    try {
      history.replaceState({}, "", "#" + s);
    } catch (e) {}
    window.scrollTo(0, 0);
  };
  const Screen = {
    welcome: WelcomeScreen,
    auth: AuthScreen,
    home: HomeScreen,
    recommend: RecommendScreen,
    palate: PalateScreen,
    journal: JournalScreen
  }[screen];
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Screen, {
    go: go
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      bottom: 12,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 200,
      display: "flex",
      gap: 2,
      background: "rgba(27,61,47,0.88)",
      backdropFilter: "blur(8px)",
      borderRadius: 100,
      padding: "4px 6px",
      boxShadow: "0 4px 20px rgba(27,61,47,0.3)"
    }
  }, Object.entries(SCREENS).map(([id, label]) => /*#__PURE__*/React.createElement("button", {
    key: id,
    onClick: () => go(id),
    style: {
      border: "none",
      cursor: "pointer",
      borderRadius: 100,
      padding: "6px 11px",
      fontFamily: KIT_SANS,
      fontSize: 11,
      fontWeight: 600,
      background: screen === id ? "#F5F0E8" : "transparent",
      color: screen === id ? "#1B3D2F" : "rgba(245,240,232,0.75)"
    }
  }, label))));
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(KitApp, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sommeasy/app.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sommeasy/data.jsx
try { (() => {
// Shared sample data + tiny helpers for the Sommeasy UI kit screens.
const SERIF = "'Playfair Display', Georgia, serif";
const SANS = "'Source Sans 3', sans-serif";
const KIT = {
  user: {
    name: "edward"
  },
  profile: {
    archetype: "The Stellenbosch Loyalist",
    epithet: "Rooted in the Cape, loyal to Chenin",
    narrative: "You drink with a home base — the Cape's granite and sea fog run through your choices, and Chenin Blanc keeps pulling you back. But you're no hermit: a Loire detour here, a Burgundy flirtation there. Your palate knows where it lives; it just likes to travel.",
    genome: {
      seed: 42,
      focus: 0.6,
      spread: 0.55,
      world: 0.35,
      range: 0.5,
      depth: 0.5,
      color: 0.45
    },
    whisper: "Chenin Blanc just joined your DNA",
    signature: {
      oldNew: 0.38,
      focus: 0.55,
      redWhite: 0.52,
      phrase: "A focused palate with a wandering eye — Old World bones, New World blood."
    }
  },
  recs: [{
    wine: "Raats Original Chenin Blanc 2022",
    why: "Old-vine Chenin from your home region — taut, waxy, mineral.",
    matchType: "region + grape"
  }, {
    wine: "Domaine Huet Le Mont Sec, Vouvray 2021",
    why: "Your grape, Loire-grown — the Old World cousin of what you love.",
    matchType: "grape"
  }, {
    wine: "Kanonkop Kadette Cape Blend 2020",
    why: "A Stellenbosch stalwart — structure and dark fruit from familiar soil.",
    matchType: "region"
  }, {
    wine: "Txakoli Ameztoi Getariako 2023",
    why: "A salty, spritzy left turn — far from home, close to your acid line.",
    matchType: "discovery"
  }],
  picks: [{
    pickType: "top",
    name: "Hamilton Russell Chardonnay 2022",
    price: 89,
    country: "🇿🇦 South Africa — Hemel-en-Aarde",
    varietal: "🥂 Chardonnay",
    note: "With the roast chicken, this is the bottle — sea-cooled Chardonnay with your kind of nerve. It drinks like white Burgundy that moved somewhere sunnier."
  }, {
    pickType: "value",
    name: "Ken Forrester Old Vine Reserve Chenin Blanc 2022",
    price: 48,
    country: "🇿🇦 South Africa — Stellenbosch",
    varietal: "🥂 Chenin Blanc",
    note: "Your home grape at a kind price. Honeyed pear up front, that waxy old-vine grip underneath."
  }, {
    pickType: "adventure",
    name: "López de Heredia Viña Gravonia Blanco 2015",
    price: 74,
    country: "🇪🇸 Spain — Rioja",
    varietal: "🥂 Viura",
    note: "Trust us on this one. Aged white Rioja is Chenin's eccentric uncle — nutty, saline, unforgettable."
  }],
  sommSummary: "A list that leans French but hides its best value in the Cape. Your lane tonight is white with backbone — three bottles below, each a different kind of yes.",
  journal: {
    tried: [{
      name: "Raats Original Chenin Blanc 2022",
      rating: "loved",
      date: "Aug 1, 2026",
      somm: {
        note: "Old-vine Chenin from your home region — taut, waxy, mineral.",
        role: "value",
        occasion: "big reds for a steak night"
      }
    }, {
      name: "Cloudy Bay Sauvignon Blanc 2023",
      rating: "fine",
      date: "Jul 24, 2026"
    }, {
      name: "Meerlust Rubicon 2019",
      rating: "liked",
      date: "Jul 12, 2026"
    }],
    want: [{
      name: "Domaine Huet Le Mont Sec, Vouvray 2021",
      date: "Jul 30, 2026"
    }],
    skipped: [{
      name: "Yellow Tail Shiraz 2023",
      date: "Jun 18, 2026"
    }],
    timeline: [{
      glyph: "✨",
      text: "You became The Stellenbosch Loyalist",
      date: "Aug 1, 2026",
      shifted: true
    }, {
      glyph: "🧬",
      text: "Chenin Blanc added to your DNA",
      date: "Aug 1, 2026"
    }, {
      glyph: "🧬",
      text: "Stellenbosch added to your regions",
      date: "Jul 12, 2026"
    }]
  },
  building: [{
    name: "Hemel-en-Aarde",
    dimension: "region",
    away: "three loved bottles away",
    ratio: 0.4
  }, {
    name: "Ken Forrester",
    dimension: "estate",
    away: "one loved bottle away",
    ratio: 0.75
  }],
  dna: {
    countries: [{
      label: "🇿🇦 South Africa"
    }, {
      label: "🇫🇷 France",
      earned: false
    }],
    regions: [{
      heading: "🇿🇦 South Africa",
      items: [{
        label: "Stellenbosch",
        earned: true
      }, {
        label: "Swartland"
      }]
    }, {
      heading: "🇫🇷 France",
      items: [{
        label: "Vouvray"
      }]
    }],
    grapes: [{
      label: "🥂 Chenin Blanc",
      earned: true
    }, {
      label: "🍇 Cabernet Sauvignon"
    }, {
      label: "🥂 Chardonnay"
    }],
    estates: [{
      heading: "Stellenbosch",
      items: [{
        label: "Kanonkop"
      }, {
        label: "Raats Family Wines",
        earned: true
      }]
    }],
    wines: [{
      label: "Meerlust Rubicon 2019"
    }]
  }
};
const kitLabel = txt => /*#__PURE__*/React.createElement("div", {
  style: {
    fontFamily: SANS,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "#1B3D2F",
    opacity: 0.35,
    marginBottom: 12,
    fontWeight: 600
  }
}, txt);
Object.assign(window, {
  KIT,
  KIT_SERIF: SERIF,
  KIT_SANS: SANS,
  kitLabel
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sommeasy/data.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Chip = __ds_scope.Chip;

__ds_ns.SectionLabel = __ds_scope.SectionLabel;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.BuildingBar = __ds_scope.BuildingBar;

__ds_ns.PromptCard = __ds_scope.PromptCard;

__ds_ns.RatingModal = __ds_scope.RatingModal;

__ds_ns.TextField = __ds_scope.TextField;

__ds_ns.AppHeader = __ds_scope.AppHeader;

__ds_ns.HeroPanel = __ds_scope.HeroPanel;

__ds_ns.StepCard = __ds_scope.StepCard;

__ds_ns.MARK_PALETTE = __ds_scope.MARK_PALETTE;

__ds_ns.MARK_GEOMETRY = __ds_scope.MARK_GEOMETRY;

__ds_ns.PalateMark = __ds_scope.PalateMark;

__ds_ns.SignatureRail = __ds_scope.SignatureRail;

__ds_ns.WineRecCard = __ds_scope.WineRecCard;

})();
