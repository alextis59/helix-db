# helix-host-mock

Deterministic test host for the internal component capability boundary. It implements every ABI 7
imported call as a bounded in-memory operation and can inject an exact stable failure at any named
call occurrence. It is unpublished and is not a native/browser component binding or database.
