// Shared patterns for the unsourced-statistic fixer (tools/fix-unsourced-stats.mjs)
// and the permanent health gate (tools/grind-health-check.mjs).
export const QUANT = /\b(?:the\s+)?(?:(?:somewhere|about|roughly|around|nearly|approximately|an estimated|over|almost|up to)\s+){0,2}(?:between\s+\d{1,3}\s+and\s+\d{1,3}\s?(?:%|percent)|\d{1,3}(?:\s?(?:-|–|to)\s?\d{1,3})?\s?(?:%|percent)|(?:one|two|three|four|1|2|3|4)\s+in\s+(?:ten|five|four|three|10|5|4|3))\s+(?:of\s+)?(?:all\s+)?(people|adults|listeners|viewers|users|responders|ASMR fans|ASMR listeners|ASMR viewers|individuals)\b/gi;

export const POPULATION = /\b\d{1,3}(?:\s?(?:-|–|to)\s?\d{1,3})?\s?(?:%|percent)\s+of\s+the\s+population\b|\bbetween\s+\d{1,3}\s+and\s+\d{1,3}\s?(?:%|percent)\s+of\s+the\s+population\b/i;

export const SOURCE_CUE = /\b(study|studies|survey|surveyed|found|finding|findings|according|research|researchers|reported|poll|respondents|participants|et al|PeerJ|PLOS|Frontiers|PubMed|published|journal)\b|\b(?:19|20)\d{2}\b|\(\d{4}\)/i;

export const TESTIMONIAL = /\b(?:one|a|another)\s+(?:user|reader|viewer|commenter|community member|redditor|listener|creator)\s+(?:wrote|said|explained|told us|commented|shared|reported)\b|\b(?:users?|readers?|commenters?)\s+on\s+r\/\w+\s+(?:wrote|said)\b/i;

// Spanish pages: "entre el 20 y el 30 por ciento de las personas ..."
export const QUANT_ES = /\b(?:(?:entre\s+el\s+\d{1,3}\s+y\s+el\s+\d{1,3}|(?:aproximadamente|alrededor\s+del|cerca\s+del|casi\s+el|el)\s+\d{1,3}(?:\s?(?:-|y|a)\s?\d{1,3})?)\s?(?:%|por\s+ciento))\s+de\s+(?:las\s+|los\s+)?(personas|adultos|usuarios|oyentes|espectadores)\b/gi;
export const SOURCE_CUE_ES = /\b(estudio|estudios|encuesta|según|publicad[oa]|revista|PubMed)\b|\b(?:19|20)\d{2}\b/i;
