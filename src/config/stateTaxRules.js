// GENERATED from the 2026 state research (changelog 361) -- edit the values here directly; see TAX_RULES_SPEC.md Rule 4.9.
// The income-tax rules of the 35 states and DC that have no hand-written
// model of their own (calculateStateTaxes' 'state_rules' jurisdiction).
// Dollar figures are tax-year 2026. Each record:
//   brackets {single, mfj}: [{limit, rate}] on state taxable income; limit null = no top
//   base: 'agi' | 'federalTaxable' (federal taxable income: the federal deduction comes off first)
//   standardDeduction: {single, mfj} | 'federal'; excludeFederalAged65 (the 'federal' figure without the s 63(f) 65+ add-on)
//   extraDeduction65 (per person; a number or {single, mfj}), personalExemption: per person
//   personalCredit: per person, off the tax
//   socialSecurity: 'exempt' | 'taxed' | { exemptIfAgiBelow: {single, mfj}, maxTaxableShare? (of gross benefits, above the line) }
//   retirementExclusion: { tiers: [{minAge, amount|null (unlimited), amountMfj?}], perReturn,
//     covers {pension, ira, investment}, agiPhase: [{agiUpTo {single,mfj}, share, shareMfj?}] | null,
//     reducedBySS, indexed, iraMinAge (IRA money qualifies only from this age), ofIncome (in the phase bands the share is of the income, not the cap),
//     phaseExcludesSS (the phase-out income test leaves Social Security out, as New Jersey's does) }
//   govPensionExempt, militaryExempt, capitalGainsExempt, surtax {over, rate} | null,
//   localRate: a typical county/local rate on the state base where nearly every resident pays one
// What each record simplifies: docs/STATE_TAX_RULES_NOTES.json; sources: stateTaxRuleSources.js.
export const STATE_TAX_RULES = Object.freeze({
 "AL": {
  "name": "Alabama",
  "taxYear": 2026,
  "brackets": {
   "single": [
    {
     "limit": 500,
     "rate": 0.02
    },
    {
     "limit": 3000,
     "rate": 0.04
    },
    {
     "limit": null,
     "rate": 0.05
    }
   ],
   "mfj": [
    {
     "limit": 1000,
     "rate": 0.02
    },
    {
     "limit": 6000,
     "rate": 0.04
    },
    {
     "limit": null,
     "rate": 0.05
    }
   ]
  },
  "bracketsIndexed": false,
  "base": "agi",
  "standardDeduction": {
   "single": 2500,
   "mfj": 5000
  },
  "extraDeduction65": 6000,
  "personalExemption": 1500,
  "personalCredit": 0,
  "deductionsIndexed": false,
  "socialSecurity": "exempt",
  "retirementExclusion": {
   "tiers": [
    {
     "minAge": 0,
     "amount": null
    }
   ],
   "perReturn": false,
   "covers": {
    "pension": true,
    "ira": false,
    "investment": false
   },
   "agiPhase": null,
   "reducedBySS": false,
   "indexed": false,
   "ofIncome": false,
   "phaseExcludesSS": false
  },
  "govPensionExempt": true,
  "militaryExempt": true,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0
 },
 "AR": {
  "name": "Arkansas",
  "taxYear": 2026,
  "brackets": {
   "single": [
    {
     "limit": 5599,
     "rate": 0
    },
    {
     "limit": 11199,
     "rate": 0.02
    },
    {
     "limit": 15999,
     "rate": 0.03
    },
    {
     "limit": 26399,
     "rate": 0.034
    },
    {
     "limit": 94700,
     "rate": 0.037
    },
    {
     "limit": 97601,
     "rate": 0.13599
    },
    {
     "limit": null,
     "rate": 0.037
    }
   ],
   "mfj": [
    {
     "limit": 5599,
     "rate": 0
    },
    {
     "limit": 11199,
     "rate": 0.02
    },
    {
     "limit": 15999,
     "rate": 0.03
    },
    {
     "limit": 26399,
     "rate": 0.034
    },
    {
     "limit": 94700,
     "rate": 0.037
    },
    {
     "limit": 97601,
     "rate": 0.13599
    },
    {
     "limit": null,
     "rate": 0.037
    }
   ]
  },
  "bracketsIndexed": true,
  "base": "agi",
  "standardDeduction": {
   "single": 2470,
   "mfj": 4940
  },
  "extraDeduction65": 0,
  "personalExemption": 0,
  "personalCredit": 29,
  "deductionsIndexed": true,
  "socialSecurity": "exempt",
  "retirementExclusion": {
   "tiers": [
    {
     "minAge": 0,
     "amount": 6000
    }
   ],
   "perReturn": false,
   "covers": {
    "pension": true,
    "ira": true,
    "investment": false
   },
   "agiPhase": null,
   "reducedBySS": false,
   "indexed": false,
   "ofIncome": false,
   "phaseExcludesSS": false
  },
  "govPensionExempt": false,
  "militaryExempt": true,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0
 },
 "AZ": {
  "name": "Arizona",
  "taxYear": 2026,
  "brackets": {
   "single": [
    {
     "limit": null,
     "rate": 0.025
    }
   ],
   "mfj": [
    {
     "limit": null,
     "rate": 0.025
    }
   ]
  },
  "bracketsIndexed": false,
  "base": "agi",
  "standardDeduction": "federal",
  "extraDeduction65": 2100,
  "personalExemption": 0,
  "personalCredit": 0,
  "deductionsIndexed": true,
  "socialSecurity": "exempt",
  "retirementExclusion": null,
  "govPensionExempt": false,
  "militaryExempt": true,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0,
  "excludeFederalAged65": true
 },
 "CT": {
  "name": "Connecticut",
  "taxYear": 2026,
  "brackets": {
   "single": [
    {
     "limit": 10000,
     "rate": 0.02
    },
    {
     "limit": 50000,
     "rate": 0.045
    },
    {
     "limit": 100000,
     "rate": 0.055
    },
    {
     "limit": 200000,
     "rate": 0.06
    },
    {
     "limit": 250000,
     "rate": 0.065
    },
    {
     "limit": 500000,
     "rate": 0.069
    },
    {
     "limit": null,
     "rate": 0.0699
    }
   ],
   "mfj": [
    {
     "limit": 20000,
     "rate": 0.02
    },
    {
     "limit": 100000,
     "rate": 0.045
    },
    {
     "limit": 200000,
     "rate": 0.055
    },
    {
     "limit": 400000,
     "rate": 0.06
    },
    {
     "limit": 500000,
     "rate": 0.065
    },
    {
     "limit": 1000000,
     "rate": 0.069
    },
    {
     "limit": null,
     "rate": 0.0699
    }
   ]
  },
  "bracketsIndexed": false,
  "base": "agi",
  "standardDeduction": {
   "single": 0,
   "mfj": 0
  },
  "extraDeduction65": 0,
  "personalExemption": 0,
  "personalCredit": 0,
  "deductionsIndexed": false,
  "socialSecurity": {
   "exemptIfAgiBelow": {
    "single": 75000,
    "mfj": 100000
   },
   "maxTaxableShare": 0.25
  },
  "retirementExclusion": {
   "tiers": [
    {
     "minAge": 0,
     "amount": null
    }
   ],
   "perReturn": false,
   "covers": {
    "pension": true,
    "ira": true,
    "investment": false
   },
   "agiPhase": [
    {
     "agiUpTo": {
      "single": 74999,
      "mfj": 99999
     },
     "share": 1
    },
    {
     "agiUpTo": {
      "single": 77499,
      "mfj": 104999
     },
     "share": 0.85
    },
    {
     "agiUpTo": {
      "single": 79999,
      "mfj": 109999
     },
     "share": 0.7
    },
    {
     "agiUpTo": {
      "single": 82499,
      "mfj": 114999
     },
     "share": 0.55
    },
    {
     "agiUpTo": {
      "single": 84999,
      "mfj": 119999
     },
     "share": 0.4
    },
    {
     "agiUpTo": {
      "single": 87499,
      "mfj": 124999
     },
     "share": 0.25
    },
    {
     "agiUpTo": {
      "single": 89999,
      "mfj": 129999
     },
     "share": 0.1
    },
    {
     "agiUpTo": {
      "single": 94999,
      "mfj": 139999
     },
     "share": 0.05
    },
    {
     "agiUpTo": {
      "single": 99999,
      "mfj": 149999
     },
     "share": 0.025
    }
   ],
   "reducedBySS": false,
   "indexed": false,
   "ofIncome": false,
   "phaseExcludesSS": false
  },
  "govPensionExempt": false,
  "militaryExempt": true,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0
 },
 "DC": {
  "name": "District of Columbia",
  "taxYear": 2026,
  "brackets": {
   "single": [
    {
     "limit": 10000,
     "rate": 0.04
    },
    {
     "limit": 40000,
     "rate": 0.06
    },
    {
     "limit": 60000,
     "rate": 0.065
    },
    {
     "limit": 250000,
     "rate": 0.085
    },
    {
     "limit": 500000,
     "rate": 0.0925
    },
    {
     "limit": 1000000,
     "rate": 0.0975
    },
    {
     "limit": null,
     "rate": 0.1075
    }
   ],
   "mfj": [
    {
     "limit": 10000,
     "rate": 0.04
    },
    {
     "limit": 40000,
     "rate": 0.06
    },
    {
     "limit": 60000,
     "rate": 0.065
    },
    {
     "limit": 250000,
     "rate": 0.085
    },
    {
     "limit": 500000,
     "rate": 0.0925
    },
    {
     "limit": 1000000,
     "rate": 0.0975
    },
    {
     "limit": null,
     "rate": 0.1075
    }
   ]
  },
  "bracketsIndexed": false,
  "base": "agi",
  "standardDeduction": "federal",
  "extraDeduction65": 0,
  "personalExemption": 0,
  "personalCredit": 0,
  "deductionsIndexed": true,
  "socialSecurity": "exempt",
  "retirementExclusion": null,
  "govPensionExempt": false,
  "militaryExempt": false,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0
 },
 "DE": {
  "name": "Delaware",
  "taxYear": 2026,
  "brackets": {
   "single": [
    {
     "limit": 2000,
     "rate": 0
    },
    {
     "limit": 5000,
     "rate": 0.022
    },
    {
     "limit": 10000,
     "rate": 0.039
    },
    {
     "limit": 20000,
     "rate": 0.048
    },
    {
     "limit": 25000,
     "rate": 0.052
    },
    {
     "limit": 60000,
     "rate": 0.0555
    },
    {
     "limit": null,
     "rate": 0.066
    }
   ],
   "mfj": [
    {
     "limit": 2000,
     "rate": 0
    },
    {
     "limit": 5000,
     "rate": 0.022
    },
    {
     "limit": 10000,
     "rate": 0.039
    },
    {
     "limit": 20000,
     "rate": 0.048
    },
    {
     "limit": 25000,
     "rate": 0.052
    },
    {
     "limit": 60000,
     "rate": 0.0555
    },
    {
     "limit": null,
     "rate": 0.066
    }
   ]
  },
  "bracketsIndexed": false,
  "base": "agi",
  "standardDeduction": {
   "single": 3250,
   "mfj": 6500
  },
  "extraDeduction65": 2500,
  "personalExemption": 0,
  "personalCredit": 110,
  "deductionsIndexed": false,
  "socialSecurity": "exempt",
  "retirementExclusion": {
   "tiers": [
    {
     "minAge": 0,
     "amount": 2000
    },
    {
     "minAge": 60,
     "amount": 12500
    }
   ],
   "perReturn": false,
   "covers": {
    "pension": true,
    "ira": true,
    "investment": true
   },
   "agiPhase": null,
   "reducedBySS": false,
   "indexed": false,
   "ofIncome": false,
   "phaseExcludesSS": false
  },
  "govPensionExempt": false,
  "militaryExempt": false,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0
 },
 "GA": {
  "name": "Georgia",
  "taxYear": 2026,
  "brackets": {
   "single": [
    {
     "limit": null,
     "rate": 0.0499
    }
   ],
   "mfj": [
    {
     "limit": null,
     "rate": 0.0499
    }
   ]
  },
  "bracketsIndexed": false,
  "base": "agi",
  "standardDeduction": {
   "single": 15000,
   "mfj": 30000
  },
  "extraDeduction65": 1300,
  "personalExemption": 0,
  "personalCredit": 0,
  "deductionsIndexed": false,
  "socialSecurity": "exempt",
  "retirementExclusion": {
   "tiers": [
    {
     "minAge": 62,
     "amount": 35000
    },
    {
     "minAge": 65,
     "amount": 65000
    }
   ],
   "perReturn": false,
   "covers": {
    "pension": true,
    "ira": true,
    "investment": true
   },
   "agiPhase": null,
   "reducedBySS": false,
   "indexed": false,
   "ofIncome": false,
   "phaseExcludesSS": false
  },
  "govPensionExempt": false,
  "militaryExempt": false,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0
 },
 "HI": {
  "name": "Hawaii",
  "taxYear": 2026,
  "brackets": {
   "single": [
    {
     "limit": 9600,
     "rate": 0.014
    },
    {
     "limit": 14400,
     "rate": 0.032
    },
    {
     "limit": 19200,
     "rate": 0.055
    },
    {
     "limit": 24000,
     "rate": 0.064
    },
    {
     "limit": 36000,
     "rate": 0.068
    },
    {
     "limit": 48000,
     "rate": 0.072
    },
    {
     "limit": 125000,
     "rate": 0.076
    },
    {
     "limit": 175000,
     "rate": 0.079
    },
    {
     "limit": 225000,
     "rate": 0.0825
    },
    {
     "limit": 275000,
     "rate": 0.09
    },
    {
     "limit": 325000,
     "rate": 0.1
    },
    {
     "limit": null,
     "rate": 0.11
    }
   ],
   "mfj": [
    {
     "limit": 19200,
     "rate": 0.014
    },
    {
     "limit": 28800,
     "rate": 0.032
    },
    {
     "limit": 38400,
     "rate": 0.055
    },
    {
     "limit": 48000,
     "rate": 0.064
    },
    {
     "limit": 72000,
     "rate": 0.068
    },
    {
     "limit": 96000,
     "rate": 0.072
    },
    {
     "limit": 250000,
     "rate": 0.076
    },
    {
     "limit": 350000,
     "rate": 0.079
    },
    {
     "limit": 450000,
     "rate": 0.0825
    },
    {
     "limit": 550000,
     "rate": 0.09
    },
    {
     "limit": 650000,
     "rate": 0.1
    },
    {
     "limit": null,
     "rate": 0.11
    }
   ]
  },
  "bracketsIndexed": false,
  "base": "agi",
  "standardDeduction": {
   "single": 8000,
   "mfj": 16000
  },
  "extraDeduction65": 1144,
  "personalExemption": 1144,
  "personalCredit": 0,
  "deductionsIndexed": false,
  "socialSecurity": "exempt",
  "retirementExclusion": {
   "tiers": [
    {
     "minAge": 0,
     "amount": null
    }
   ],
   "perReturn": false,
   "covers": {
    "pension": true,
    "ira": false,
    "investment": false
   },
   "agiPhase": null,
   "reducedBySS": false,
   "indexed": false,
   "ofIncome": false,
   "phaseExcludesSS": false
  },
  "govPensionExempt": true,
  "militaryExempt": true,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0
 },
 "IA": {
  "name": "Iowa",
  "taxYear": 2026,
  "brackets": {
   "single": [
    {
     "limit": null,
     "rate": 0.038
    }
   ],
   "mfj": [
    {
     "limit": null,
     "rate": 0.038
    }
   ]
  },
  "bracketsIndexed": false,
  "base": "federalTaxable",
  "standardDeduction": {
   "single": 0,
   "mfj": 0
  },
  "extraDeduction65": 526,
  "personalExemption": 0,
  "personalCredit": 40,
  "deductionsIndexed": false,
  "socialSecurity": "exempt",
  "retirementExclusion": {
   "tiers": [
    {
     "minAge": 55,
     "amount": null
    }
   ],
   "perReturn": false,
   "covers": {
    "pension": true,
    "ira": true,
    "investment": false
   },
   "agiPhase": null,
   "reducedBySS": false,
   "indexed": false,
   "ofIncome": false,
   "phaseExcludesSS": false
  },
  "govPensionExempt": false,
  "militaryExempt": true,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0.002
 },
 "ID": {
  "name": "Idaho",
  "taxYear": 2026,
  "brackets": {
   "single": [
    {
     "limit": 4940,
     "rate": 0
    },
    {
     "limit": null,
     "rate": 0.053
    }
   ],
   "mfj": [
    {
     "limit": 9880,
     "rate": 0
    },
    {
     "limit": null,
     "rate": 0.053
    }
   ]
  },
  "bracketsIndexed": true,
  "base": "agi",
  "standardDeduction": "federal",
  "extraDeduction65": 0,
  "personalExemption": 0,
  "personalCredit": 0,
  "deductionsIndexed": true,
  "socialSecurity": "exempt",
  "retirementExclusion": null,
  "govPensionExempt": false,
  "militaryExempt": false,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0
 },
 "IN": {
  "name": "Indiana",
  "taxYear": 2026,
  "brackets": {
   "single": [
    {
     "limit": null,
     "rate": 0.0295
    }
   ],
   "mfj": [
    {
     "limit": null,
     "rate": 0.0295
    }
   ]
  },
  "bracketsIndexed": false,
  "base": "agi",
  "standardDeduction": {
   "single": 0,
   "mfj": 0
  },
  "extraDeduction65": 1000,
  "personalExemption": 1000,
  "personalCredit": 0,
  "deductionsIndexed": false,
  "socialSecurity": "exempt",
  "retirementExclusion": null,
  "govPensionExempt": false,
  "militaryExempt": true,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0.0175
 },
 "KS": {
  "name": "Kansas",
  "taxYear": 2026,
  "brackets": {
   "single": [
    {
     "limit": 23000,
     "rate": 0.052
    },
    {
     "limit": null,
     "rate": 0.0558
    }
   ],
   "mfj": [
    {
     "limit": 46000,
     "rate": 0.052
    },
    {
     "limit": null,
     "rate": 0.0558
    }
   ]
  },
  "bracketsIndexed": false,
  "base": "agi",
  "standardDeduction": {
   "single": 3605,
   "mfj": 8240
  },
  "extraDeduction65": 700,
  "personalExemption": 9160,
  "personalCredit": 0,
  "deductionsIndexed": false,
  "socialSecurity": "exempt",
  "retirementExclusion": null,
  "govPensionExempt": true,
  "militaryExempt": true,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0
 },
 "KY": {
  "name": "Kentucky",
  "taxYear": 2026,
  "brackets": {
   "single": [
    {
     "limit": null,
     "rate": 0.035
    }
   ],
   "mfj": [
    {
     "limit": null,
     "rate": 0.035
    }
   ]
  },
  "bracketsIndexed": false,
  "base": "agi",
  "standardDeduction": {
   "single": 3360,
   "mfj": 6720
  },
  "extraDeduction65": 1143,
  "personalExemption": 0,
  "personalCredit": 0,
  "deductionsIndexed": true,
  "socialSecurity": "exempt",
  "retirementExclusion": {
   "tiers": [
    {
     "minAge": 0,
     "amount": 31110
    }
   ],
   "perReturn": false,
   "covers": {
    "pension": true,
    "ira": true,
    "investment": false
   },
   "agiPhase": null,
   "reducedBySS": false,
   "indexed": false,
   "ofIncome": false,
   "phaseExcludesSS": false
  },
  "govPensionExempt": false,
  "militaryExempt": false,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0
 },
 "LA": {
  "name": "Louisiana",
  "taxYear": 2026,
  "brackets": {
   "single": [
    {
     "limit": null,
     "rate": 0.03
    }
   ],
   "mfj": [
    {
     "limit": null,
     "rate": 0.03
    }
   ]
  },
  "bracketsIndexed": false,
  "base": "agi",
  "standardDeduction": {
   "single": 12875,
   "mfj": 25750
  },
  "extraDeduction65": 0,
  "personalExemption": 0,
  "personalCredit": 0,
  "deductionsIndexed": true,
  "socialSecurity": "exempt",
  "retirementExclusion": {
   "tiers": [
    {
     "minAge": 65,
     "amount": 12000
    }
   ],
   "perReturn": false,
   "covers": {
    "pension": true,
    "ira": true,
    "investment": false
   },
   "agiPhase": null,
   "reducedBySS": false,
   "indexed": false,
   "ofIncome": false,
   "phaseExcludesSS": false
  },
  "govPensionExempt": true,
  "militaryExempt": true,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0
 },
 "MA": {
  "name": "Massachusetts",
  "taxYear": 2026,
  "brackets": {
   "single": [
    {
     "limit": null,
     "rate": 0.05
    }
   ],
   "mfj": [
    {
     "limit": null,
     "rate": 0.05
    }
   ]
  },
  "bracketsIndexed": false,
  "base": "agi",
  "standardDeduction": {
   "single": 0,
   "mfj": 0
  },
  "extraDeduction65": 700,
  "personalExemption": 4400,
  "personalCredit": 0,
  "deductionsIndexed": false,
  "socialSecurity": "exempt",
  "retirementExclusion": null,
  "govPensionExempt": true,
  "militaryExempt": true,
  "capitalGainsExempt": false,
  "surtax": {
   "over": 1107750,
   "rate": 0.04
  },
  "localRate": 0
 },
 "MD": {
  "name": "Maryland",
  "taxYear": 2026,
  "brackets": {
   "single": [
    {
     "limit": 1000,
     "rate": 0.02
    },
    {
     "limit": 2000,
     "rate": 0.03
    },
    {
     "limit": 3000,
     "rate": 0.04
    },
    {
     "limit": 100000,
     "rate": 0.0475
    },
    {
     "limit": 125000,
     "rate": 0.05
    },
    {
     "limit": 150000,
     "rate": 0.0525
    },
    {
     "limit": 250000,
     "rate": 0.055
    },
    {
     "limit": 500000,
     "rate": 0.0575
    },
    {
     "limit": 1000000,
     "rate": 0.0625
    },
    {
     "limit": null,
     "rate": 0.065
    }
   ],
   "mfj": [
    {
     "limit": 1000,
     "rate": 0.02
    },
    {
     "limit": 2000,
     "rate": 0.03
    },
    {
     "limit": 3000,
     "rate": 0.04
    },
    {
     "limit": 150000,
     "rate": 0.0475
    },
    {
     "limit": 175000,
     "rate": 0.05
    },
    {
     "limit": 225000,
     "rate": 0.0525
    },
    {
     "limit": 300000,
     "rate": 0.055
    },
    {
     "limit": 600000,
     "rate": 0.0575
    },
    {
     "limit": 1200000,
     "rate": 0.0625
    },
    {
     "limit": null,
     "rate": 0.065
    }
   ]
  },
  "bracketsIndexed": false,
  "base": "agi",
  "standardDeduction": {
   "single": 3400,
   "mfj": 6850
  },
  "extraDeduction65": 1000,
  "personalExemption": 3200,
  "personalCredit": 0,
  "deductionsIndexed": true,
  "socialSecurity": "exempt",
  "retirementExclusion": {
   "tiers": [
    {
     "minAge": 65,
     "amount": 40600
    }
   ],
   "perReturn": false,
   "covers": {
    "pension": true,
    "ira": false,
    "investment": false
   },
   "agiPhase": null,
   "reducedBySS": true,
   "indexed": true,
   "ofIncome": false,
   "phaseExcludesSS": false
  },
  "govPensionExempt": false,
  "militaryExempt": false,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0.031
 },
 "ME": {
  "name": "Maine",
  "taxYear": 2026,
  "brackets": {
   "single": [
    {
     "limit": 27400,
     "rate": 0.058
    },
    {
     "limit": 64850,
     "rate": 0.0675
    },
    {
     "limit": null,
     "rate": 0.0715
    }
   ],
   "mfj": [
    {
     "limit": 54850,
     "rate": 0.058
    },
    {
     "limit": 129750,
     "rate": 0.0675
    },
    {
     "limit": null,
     "rate": 0.0715
    }
   ]
  },
  "bracketsIndexed": true,
  "base": "agi",
  "standardDeduction": {
   "single": 15700,
   "mfj": 31400
  },
  "extraDeduction65": 1650,
  "personalExemption": 5300,
  "personalCredit": 0,
  "deductionsIndexed": true,
  "socialSecurity": "exempt",
  "retirementExclusion": {
   "tiers": [
    {
     "minAge": 55,
     "amount": 49824
    }
   ],
   "perReturn": false,
   "covers": {
    "pension": true,
    "ira": true,
    "investment": false
   },
   "agiPhase": [
    {
     "agiUpTo": {
      "single": 125000,
      "mfj": 250000
     },
     "share": 1
    },
    {
     "agiUpTo": {
      "single": 375000,
      "mfj": 750000
     },
     "share": 0.9
    },
    {
     "agiUpTo": {
      "single": 625000,
      "mfj": 1250000
     },
     "share": 0.7
    },
    {
     "agiUpTo": {
      "single": 875000,
      "mfj": 1750000
     },
     "share": 0.5
    },
    {
     "agiUpTo": {
      "single": 1125000,
      "mfj": 2250000
     },
     "share": 0.3
    },
    {
     "agiUpTo": {
      "single": 1370000,
      "mfj": 2740000
     },
     "share": 0.1
    }
   ],
   "reducedBySS": true,
   "indexed": true,
   "ofIncome": false,
   "phaseExcludesSS": false
  },
  "govPensionExempt": false,
  "militaryExempt": true,
  "capitalGainsExempt": false,
  "surtax": {
   "over": 1000000,
   "rate": 0.02
  },
  "localRate": 0
 },
 "MI": {
  "name": "Michigan",
  "taxYear": 2026,
  "brackets": {
   "single": [
    {
     "limit": null,
     "rate": 0.0425
    }
   ],
   "mfj": [
    {
     "limit": null,
     "rate": 0.0425
    }
   ]
  },
  "bracketsIndexed": false,
  "base": "agi",
  "standardDeduction": {
   "single": 0,
   "mfj": 0
  },
  "extraDeduction65": 0,
  "personalExemption": 5900,
  "personalCredit": 0,
  "deductionsIndexed": true,
  "socialSecurity": "exempt",
  "retirementExclusion": {
   "tiers": [
    {
     "minAge": 0,
     "amount": 67610,
     "amountMfj": 135220
    }
   ],
   "perReturn": true,
   "covers": {
    "pension": true,
    "ira": true,
    "investment": false
   },
   "agiPhase": null,
   "reducedBySS": false,
   "indexed": true,
   "ofIncome": false,
   "phaseExcludesSS": false,
   "iraMinAge": 59.5
  },
  "govPensionExempt": false,
  "militaryExempt": true,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0
 },
 "MN": {
  "name": "Minnesota",
  "taxYear": 2026,
  "brackets": {
   "single": [
    {
     "limit": 33310,
     "rate": 0.0535
    },
    {
     "limit": 109430,
     "rate": 0.068
    },
    {
     "limit": 203150,
     "rate": 0.0785
    },
    {
     "limit": null,
     "rate": 0.0985
    }
   ],
   "mfj": [
    {
     "limit": 48700,
     "rate": 0.0535
    },
    {
     "limit": 193480,
     "rate": 0.068
    },
    {
     "limit": 337930,
     "rate": 0.0785
    },
    {
     "limit": null,
     "rate": 0.0985
    }
   ]
  },
  "bracketsIndexed": true,
  "base": "agi",
  "standardDeduction": {
   "single": 15300,
   "mfj": 30600
  },
  "extraDeduction65": 1600,
  "personalExemption": 0,
  "personalCredit": 0,
  "deductionsIndexed": true,
  "socialSecurity": {
   "exemptIfAgiBelow": {
    "single": 86410,
    "mfj": 110780
   }
  },
  "retirementExclusion": null,
  "govPensionExempt": false,
  "militaryExempt": true,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0
 },
 "MO": {
  "name": "Missouri",
  "taxYear": 2026,
  "brackets": {
   "single": [
    {
     "limit": 1348,
     "rate": 0
    },
    {
     "limit": 2696,
     "rate": 0.02
    },
    {
     "limit": 4044,
     "rate": 0.025
    },
    {
     "limit": 5392,
     "rate": 0.03
    },
    {
     "limit": 6740,
     "rate": 0.035
    },
    {
     "limit": 8088,
     "rate": 0.04
    },
    {
     "limit": 9436,
     "rate": 0.045
    },
    {
     "limit": null,
     "rate": 0.047
    }
   ],
   "mfj": [
    {
     "limit": 1348,
     "rate": 0
    },
    {
     "limit": 2696,
     "rate": 0.02
    },
    {
     "limit": 4044,
     "rate": 0.025
    },
    {
     "limit": 5392,
     "rate": 0.03
    },
    {
     "limit": 6740,
     "rate": 0.035
    },
    {
     "limit": 8088,
     "rate": 0.04
    },
    {
     "limit": 9436,
     "rate": 0.045
    },
    {
     "limit": null,
     "rate": 0.047
    }
   ]
  },
  "bracketsIndexed": true,
  "base": "agi",
  "standardDeduction": "federal",
  "extraDeduction65": 0,
  "personalExemption": 0,
  "personalCredit": 0,
  "deductionsIndexed": true,
  "socialSecurity": "exempt",
  "retirementExclusion": null,
  "govPensionExempt": false,
  "militaryExempt": true,
  "capitalGainsExempt": true,
  "surtax": null,
  "localRate": 0
 },
 "MS": {
  "name": "Mississippi",
  "taxYear": 2026,
  "brackets": {
   "single": [
    {
     "limit": 10000,
     "rate": 0
    },
    {
     "limit": null,
     "rate": 0.04
    }
   ],
   "mfj": [
    {
     "limit": 20000,
     "rate": 0
    },
    {
     "limit": null,
     "rate": 0.04
    }
   ]
  },
  "bracketsIndexed": false,
  "base": "agi",
  "standardDeduction": {
   "single": 2300,
   "mfj": 4600
  },
  "extraDeduction65": 1500,
  "personalExemption": 6000,
  "personalCredit": 0,
  "deductionsIndexed": false,
  "socialSecurity": "exempt",
  "retirementExclusion": {
   "tiers": [
    {
     "minAge": 0,
     "amount": null
    }
   ],
   "perReturn": false,
   "covers": {
    "pension": true,
    "ira": true,
    "investment": false
   },
   "agiPhase": null,
   "reducedBySS": false,
   "indexed": false,
   "ofIncome": false,
   "phaseExcludesSS": false,
   "iraMinAge": 59.5
  },
  "govPensionExempt": true,
  "militaryExempt": true,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0
 },
 "MT": {
  "name": "Montana",
  "taxYear": 2026,
  "brackets": {
   "single": [
    {
     "limit": 47500,
     "rate": 0.047
    },
    {
     "limit": null,
     "rate": 0.0565
    }
   ],
   "mfj": [
    {
     "limit": 95000,
     "rate": 0.047
    },
    {
     "limit": null,
     "rate": 0.0565
    }
   ]
  },
  "bracketsIndexed": false,
  "base": "federalTaxable",
  "standardDeduction": {
   "single": 0,
   "mfj": 0
  },
  "extraDeduction65": 5660,
  "personalExemption": 0,
  "personalCredit": 0,
  "deductionsIndexed": true,
  "socialSecurity": "taxed",
  "retirementExclusion": null,
  "govPensionExempt": false,
  "militaryExempt": false,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0
 },
 "NC": {
  "name": "North Carolina",
  "taxYear": 2026,
  "brackets": {
   "single": [
    {
     "limit": null,
     "rate": 0.0399
    }
   ],
   "mfj": [
    {
     "limit": null,
     "rate": 0.0399
    }
   ]
  },
  "bracketsIndexed": false,
  "base": "agi",
  "standardDeduction": {
   "single": 12750,
   "mfj": 25500
  },
  "extraDeduction65": 0,
  "personalExemption": 0,
  "personalCredit": 0,
  "deductionsIndexed": false,
  "socialSecurity": "exempt",
  "retirementExclusion": null,
  "govPensionExempt": false,
  "militaryExempt": true,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0
 },
 "ND": {
  "name": "North Dakota",
  "taxYear": 2026,
  "brackets": {
   "single": [
    {
     "limit": 49575,
     "rate": 0
    },
    {
     "limit": 250400,
     "rate": 0.0195
    },
    {
     "limit": null,
     "rate": 0.025
    }
   ],
   "mfj": [
    {
     "limit": 82800,
     "rate": 0
    },
    {
     "limit": 304850,
     "rate": 0.0195
    },
    {
     "limit": null,
     "rate": 0.025
    }
   ]
  },
  "bracketsIndexed": true,
  "base": "federalTaxable",
  "standardDeduction": {
   "single": 0,
   "mfj": 0
  },
  "extraDeduction65": 0,
  "personalExemption": 0,
  "personalCredit": 0,
  "deductionsIndexed": false,
  "socialSecurity": "exempt",
  "retirementExclusion": null,
  "govPensionExempt": false,
  "militaryExempt": true,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0
 },
 "NE": {
  "name": "Nebraska",
  "taxYear": 2026,
  "brackets": {
   "single": [
    {
     "limit": 4130,
     "rate": 0.0246
    },
    {
     "limit": 24760,
     "rate": 0.0351
    },
    {
     "limit": null,
     "rate": 0.0455
    }
   ],
   "mfj": [
    {
     "limit": 8250,
     "rate": 0.0246
    },
    {
     "limit": 49530,
     "rate": 0.0351
    },
    {
     "limit": null,
     "rate": 0.0455
    }
   ]
  },
  "bracketsIndexed": true,
  "base": "agi",
  "standardDeduction": {
   "single": 8850,
   "mfj": 17700
  },
  "extraDeduction65": {
   "single": 2050,
   "mfj": 1700
  },
  "personalExemption": 0,
  "personalCredit": 176,
  "deductionsIndexed": true,
  "socialSecurity": "exempt",
  "retirementExclusion": null,
  "govPensionExempt": false,
  "militaryExempt": true,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0
 },
 "NJ": {
  "name": "New Jersey",
  "taxYear": 2026,
  "brackets": {
   "single": [
    {
     "limit": 20000,
     "rate": 0.014
    },
    {
     "limit": 35000,
     "rate": 0.0175
    },
    {
     "limit": 40000,
     "rate": 0.035
    },
    {
     "limit": 75000,
     "rate": 0.05525
    },
    {
     "limit": 500000,
     "rate": 0.0637
    },
    {
     "limit": 1000000,
     "rate": 0.0897
    },
    {
     "limit": null,
     "rate": 0.1075
    }
   ],
   "mfj": [
    {
     "limit": 20000,
     "rate": 0.014
    },
    {
     "limit": 50000,
     "rate": 0.0175
    },
    {
     "limit": 70000,
     "rate": 0.0245
    },
    {
     "limit": 80000,
     "rate": 0.035
    },
    {
     "limit": 150000,
     "rate": 0.05525
    },
    {
     "limit": 500000,
     "rate": 0.0637
    },
    {
     "limit": 1000000,
     "rate": 0.0897
    },
    {
     "limit": null,
     "rate": 0.1075
    }
   ]
  },
  "bracketsIndexed": false,
  "base": "agi",
  "standardDeduction": {
   "single": 0,
   "mfj": 0
  },
  "extraDeduction65": 1000,
  "personalExemption": 1000,
  "personalCredit": 0,
  "deductionsIndexed": false,
  "socialSecurity": "exempt",
  "retirementExclusion": {
   "tiers": [
    {
     "minAge": 62,
     "amount": 75000,
     "amountMfj": 100000
    }
   ],
   "perReturn": true,
   "covers": {
    "pension": true,
    "ira": true,
    "investment": false
   },
   "agiPhase": [
    {
     "agiUpTo": {
      "single": 100000,
      "mfj": 100000
     },
     "share": 1,
     "shareMfj": 1
    },
    {
     "agiUpTo": {
      "single": 125000,
      "mfj": 125000
     },
     "share": 0.375,
     "shareMfj": 0.5
    },
    {
     "agiUpTo": {
      "single": 150000,
      "mfj": 150000
     },
     "share": 0.1875,
     "shareMfj": 0.25
    }
   ],
   "reducedBySS": false,
   "indexed": false,
   "ofIncome": true,
   "phaseExcludesSS": true
  },
  "govPensionExempt": false,
  "militaryExempt": true,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0
 },
 "NM": {
  "name": "New Mexico",
  "taxYear": 2026,
  "brackets": {
   "single": [
    {
     "limit": 5500,
     "rate": 0.015
    },
    {
     "limit": 16500,
     "rate": 0.032
    },
    {
     "limit": 33500,
     "rate": 0.043
    },
    {
     "limit": 66500,
     "rate": 0.047
    },
    {
     "limit": 210000,
     "rate": 0.049
    },
    {
     "limit": null,
     "rate": 0.059
    }
   ],
   "mfj": [
    {
     "limit": 8000,
     "rate": 0.015
    },
    {
     "limit": 25000,
     "rate": 0.032
    },
    {
     "limit": 50000,
     "rate": 0.043
    },
    {
     "limit": 100000,
     "rate": 0.047
    },
    {
     "limit": 315000,
     "rate": 0.049
    },
    {
     "limit": null,
     "rate": 0.059
    }
   ]
  },
  "bracketsIndexed": false,
  "base": "agi",
  "standardDeduction": "federal",
  "extraDeduction65": 0,
  "personalExemption": 0,
  "personalCredit": 0,
  "deductionsIndexed": true,
  "socialSecurity": {
   "exemptIfAgiBelow": {
    "single": 100000,
    "mfj": 150000
   }
  },
  "retirementExclusion": null,
  "govPensionExempt": false,
  "militaryExempt": false,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0
 },
 "OH": {
  "name": "Ohio",
  "taxYear": 2026,
  "displayRate": "2.75% above $26,050",
  "brackets": {
   "single": [
    {
     "limit": 26050,
     "rate": 0
    },
    {
     "limit": 36050,
     "rate": 0.0607
    },
    {
     "limit": null,
     "rate": 0.0275
    }
   ],
   "mfj": [
    {
     "limit": 26050,
     "rate": 0
    },
    {
     "limit": 36050,
     "rate": 0.0607
    },
    {
     "limit": null,
     "rate": 0.0275
    }
   ]
  },
  "bracketsIndexed": false,
  "base": "agi",
  "standardDeduction": {
   "single": 0,
   "mfj": 0
  },
  "extraDeduction65": 0,
  "personalExemption": 2150,
  "personalCredit": 0,
  "deductionsIndexed": false,
  "socialSecurity": "exempt",
  "retirementExclusion": null,
  "govPensionExempt": false,
  "militaryExempt": true,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0
 },
 "OK": {
  "name": "Oklahoma",
  "taxYear": 2026,
  "brackets": {
   "single": [
    {
     "limit": 3750,
     "rate": 0
    },
    {
     "limit": 4900,
     "rate": 0.025
    },
    {
     "limit": 7200,
     "rate": 0.035
    },
    {
     "limit": null,
     "rate": 0.045
    }
   ],
   "mfj": [
    {
     "limit": 7500,
     "rate": 0
    },
    {
     "limit": 9800,
     "rate": 0.025
    },
    {
     "limit": 14400,
     "rate": 0.035
    },
    {
     "limit": null,
     "rate": 0.045
    }
   ]
  },
  "bracketsIndexed": false,
  "base": "agi",
  "standardDeduction": {
   "single": 6350,
   "mfj": 12700
  },
  "extraDeduction65": 0,
  "personalExemption": 1000,
  "personalCredit": 0,
  "deductionsIndexed": false,
  "socialSecurity": "exempt",
  "retirementExclusion": {
   "tiers": [
    {
     "minAge": 0,
     "amount": 10000
    }
   ],
   "perReturn": false,
   "covers": {
    "pension": true,
    "ira": true,
    "investment": false
   },
   "agiPhase": null,
   "reducedBySS": false,
   "indexed": false,
   "ofIncome": false,
   "phaseExcludesSS": false
  },
  "govPensionExempt": false,
  "militaryExempt": true,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0
 },
 "OR": {
  "name": "Oregon",
  "taxYear": 2026,
  "brackets": {
   "single": [
    {
     "limit": 4550,
     "rate": 0.0475
    },
    {
     "limit": 11400,
     "rate": 0.0675
    },
    {
     "limit": 125000,
     "rate": 0.0875
    },
    {
     "limit": null,
     "rate": 0.099
    }
   ],
   "mfj": [
    {
     "limit": 9100,
     "rate": 0.0475
    },
    {
     "limit": 22800,
     "rate": 0.0675
    },
    {
     "limit": 250000,
     "rate": 0.0875
    },
    {
     "limit": null,
     "rate": 0.099
    }
   ]
  },
  "bracketsIndexed": true,
  "base": "agi",
  "standardDeduction": {
   "single": 11660,
   "mfj": 14570
  },
  "extraDeduction65": 1000,
  "personalExemption": 0,
  "personalCredit": 263,
  "deductionsIndexed": true,
  "socialSecurity": "exempt",
  "retirementExclusion": null,
  "govPensionExempt": false,
  "militaryExempt": false,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0
 },
 "RI": {
  "name": "Rhode Island",
  "taxYear": 2026,
  "brackets": {
   "single": [
    {
     "limit": 82050,
     "rate": 0.0375
    },
    {
     "limit": 186450,
     "rate": 0.0475
    },
    {
     "limit": null,
     "rate": 0.0599
    }
   ],
   "mfj": [
    {
     "limit": 82050,
     "rate": 0.0375
    },
    {
     "limit": 186450,
     "rate": 0.0475
    },
    {
     "limit": null,
     "rate": 0.0599
    }
   ]
  },
  "bracketsIndexed": true,
  "base": "agi",
  "standardDeduction": {
   "single": 11200,
   "mfj": 22400
  },
  "extraDeduction65": 0,
  "personalExemption": 5250,
  "personalCredit": 0,
  "deductionsIndexed": true,
  "socialSecurity": {
   "exemptIfAgiBelow": {
    "single": 107000,
    "mfj": 133750
   }
  },
  "retirementExclusion": {
   "tiers": [
    {
     "minAge": 67,
     "amount": 50000
    }
   ],
   "perReturn": false,
   "covers": {
    "pension": true,
    "ira": false,
    "investment": false
   },
   "agiPhase": [
    {
     "agiUpTo": {
      "single": 107000,
      "mfj": 133750
     },
     "share": 1
    }
   ],
   "reducedBySS": false,
   "indexed": false,
   "ofIncome": false,
   "phaseExcludesSS": false
  },
  "govPensionExempt": false,
  "militaryExempt": true,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0
 },
 "SC": {
  "name": "South Carolina",
  "taxYear": 2026,
  "displayRate": "1.99%–5.21%",
  "brackets": {
   "single": [
    {
     "limit": 15000,
     "rate": 0
    },
    {
     "limit": 40000,
     "rate": 0.0199
    },
    {
     "limit": 43929,
     "rate": 0.025327
    },
    {
     "limit": 95000,
     "rate": 0.066309
    },
    {
     "limit": null,
     "rate": 0.0521
    }
   ],
   "mfj": [
    {
     "limit": 30000,
     "rate": 0
    },
    {
     "limit": 60000,
     "rate": 0.0199
    },
    {
     "limit": 80000,
     "rate": 0.0521
    },
    {
     "limit": 190000,
     "rate": 0.066309
    },
    {
     "limit": null,
     "rate": 0.0521
    }
   ]
  },
  "bracketsIndexed": false,
  "base": "agi",
  "standardDeduction": {
   "single": 0,
   "mfj": 0
  },
  "extraDeduction65": 5000,
  "personalExemption": 0,
  "personalCredit": 0,
  "deductionsIndexed": false,
  "socialSecurity": "exempt",
  "retirementExclusion": {
   "tiers": [
    {
     "minAge": 0,
     "amount": 3000
    },
    {
     "minAge": 65,
     "amount": 10000
    }
   ],
   "perReturn": false,
   "covers": {
    "pension": true,
    "ira": true,
    "investment": false
   },
   "agiPhase": null,
   "reducedBySS": false,
   "indexed": false,
   "ofIncome": false,
   "phaseExcludesSS": false
  },
  "govPensionExempt": false,
  "militaryExempt": true,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0
 },
 "UT": {
  "name": "Utah",
  "taxYear": 2026,
  "displayRate": "Flat 4.45%",
  "brackets": {
   "single": [
    {
     "limit": 21027,
     "rate": 0
    },
    {
     "limit": 93004,
     "rate": 0.0575
    },
    {
     "limit": null,
     "rate": 0.0445
    }
   ],
   "mfj": [
    {
     "limit": 42054,
     "rate": 0
    },
    {
     "limit": 186007,
     "rate": 0.0575
    },
    {
     "limit": null,
     "rate": 0.0445
    }
   ]
  },
  "bracketsIndexed": false,
  "base": "agi",
  "standardDeduction": {
   "single": 0,
   "mfj": 0
  },
  "extraDeduction65": 0,
  "personalExemption": 0,
  "personalCredit": 0,
  "deductionsIndexed": false,
  "socialSecurity": {
   "exemptIfAgiBelow": {
    "single": 54000,
    "mfj": 90000
   }
  },
  "retirementExclusion": null,
  "govPensionExempt": false,
  "militaryExempt": true,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0
 },
 "VT": {
  "name": "Vermont",
  "taxYear": 2026,
  "brackets": {
   "single": [
    {
     "limit": 50750,
     "rate": 0.0335
    },
    {
     "limit": 122850,
     "rate": 0.066
    },
    {
     "limit": 256300,
     "rate": 0.076
    },
    {
     "limit": null,
     "rate": 0.0875
    }
   ],
   "mfj": [
    {
     "limit": 84700,
     "rate": 0.0335
    },
    {
     "limit": 204750,
     "rate": 0.066
    },
    {
     "limit": 312050,
     "rate": 0.076
    },
    {
     "limit": null,
     "rate": 0.0875
    }
   ]
  },
  "bracketsIndexed": true,
  "base": "agi",
  "standardDeduction": {
   "single": 7650,
   "mfj": 15300
  },
  "extraDeduction65": 1250,
  "personalExemption": 5400,
  "personalCredit": 0,
  "deductionsIndexed": true,
  "socialSecurity": {
   "exemptIfAgiBelow": {
    "single": 55000,
    "mfj": 70000
   }
  },
  "retirementExclusion": null,
  "govPensionExempt": false,
  "militaryExempt": false,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0
 },
 "WI": {
  "name": "Wisconsin",
  "taxYear": 2026,
  "displayRate": "3.5%–7.65%",
  "brackets": {
   "single": [
    {
     "limit": 13960,
     "rate": 0
    },
    {
     "limit": 20119,
     "rate": 0.035
    },
    {
     "limit": 28111,
     "rate": 0.0392
    },
    {
     "limit": 61004,
     "rate": 0.04928
    },
    {
     "limit": 136453,
     "rate": 0.05936
    },
    {
     "limit": 332720,
     "rate": 0.053
    },
    {
     "limit": null,
     "rate": 0.0765
    }
   ],
   "mfj": [
    {
     "limit": 25840,
     "rate": 0
    },
    {
     "limit": 29039,
     "rate": 0.035
    },
    {
     "limit": 43191,
     "rate": 0.041922
    },
    {
     "limit": 84192,
     "rate": 0.052702
    },
    {
     "limit": 159690,
     "rate": 0.063482
    },
    {
     "limit": 443630,
     "rate": 0.053
    },
    {
     "limit": null,
     "rate": 0.0765
    }
   ]
  },
  "bracketsIndexed": true,
  "base": "agi",
  "standardDeduction": {
   "single": 0,
   "mfj": 0
  },
  "extraDeduction65": 250,
  "personalExemption": 700,
  "personalCredit": 0,
  "deductionsIndexed": true,
  "socialSecurity": "exempt",
  "retirementExclusion": {
   "tiers": [
    {
     "minAge": 67,
     "amount": 24000
    }
   ],
   "perReturn": false,
   "covers": {
    "pension": true,
    "ira": true,
    "investment": false
   },
   "agiPhase": null,
   "reducedBySS": false,
   "indexed": false,
   "ofIncome": false,
   "phaseExcludesSS": false
  },
  "govPensionExempt": false,
  "militaryExempt": true,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0
 },
 "WV": {
  "name": "West Virginia",
  "taxYear": 2026,
  "brackets": {
   "single": [
    {
     "limit": 10000,
     "rate": 0.0211
    },
    {
     "limit": 25000,
     "rate": 0.0281
    },
    {
     "limit": 40000,
     "rate": 0.0316
    },
    {
     "limit": 60000,
     "rate": 0.0422
    },
    {
     "limit": null,
     "rate": 0.0458
    }
   ],
   "mfj": [
    {
     "limit": 10000,
     "rate": 0.0211
    },
    {
     "limit": 25000,
     "rate": 0.0281
    },
    {
     "limit": 40000,
     "rate": 0.0316
    },
    {
     "limit": 60000,
     "rate": 0.0422
    },
    {
     "limit": null,
     "rate": 0.0458
    }
   ]
  },
  "bracketsIndexed": false,
  "base": "agi",
  "standardDeduction": {
   "single": 0,
   "mfj": 0
  },
  "extraDeduction65": 0,
  "personalExemption": 2000,
  "personalCredit": 0,
  "deductionsIndexed": false,
  "socialSecurity": "exempt",
  "retirementExclusion": null,
  "govPensionExempt": false,
  "militaryExempt": true,
  "capitalGainsExempt": false,
  "surtax": null,
  "localRate": 0
 }
});
