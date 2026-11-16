export const ENGLISH_ANALYSIS =
  /\b(?:review|audit|inspect|examine|assess|summary|summari[sz]ation|summari[sz]e|analysis|analy[sz]e|critique)\b/i
export const ENGLISH_TRANSFORM =
  /\b(?:translate|rewrite|transform|rephrase|polish|revise|modify|change|edit|replace|convert|restyle)\b/i
export const ENGLISH_EXTRACT = /\b(?:extract|extraction|excerpt)\b/i
export const ENGLISH_STRUCTURE =
  /\b(?:split|divide|separate)\b.{0,48}\b(?:files?|notes?|chapters?|sections?|save|write)\b|\b(?:files?|notes?|documents?)\b.{0,48}\b(?:split|divide|separate)\b|\b(?:lines?|ranges?|segments?)\b.{0,24}\b(?:extract|excerpt)\b|\b(?:extract|excerpt)\b.{0,40}\b(?:lines?|ranges?|segments?|new (?:files?|notes?)|separate (?:files?|notes?)|save|copy|to (?:a |the )?(?:file|note))\b/i
export const ENGLISH_WHOLE_TRANSFORM =
  /\b(?:translate|rewrite|transform|rephrase|polish|revise|convert|restyle)\b.{0,48}\b(?:entire|whole|full|all|from (?:start|beginning) to (?:finish|end))\b|\b(?:entire|whole|full|all|from (?:start|beginning) to (?:finish|end))\b.{0,48}\b(?:translate|rewrite|transform|rephrase|polish|revise|convert|restyle)\b/i
export const ENGLISH_REVIEW = /\b(?:review|audit|inspect|examine|assess)\b/i
