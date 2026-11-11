// Balíček `server-only` hlásí chybu, když ho importuje něco jiného než
// serverová komponenta. Vitest běží mimo React, takže se v testech nahradí
// prázdným modulem — hlídání „tohle nesmí do prohlížeče" dělá build Nextu.
export {}
