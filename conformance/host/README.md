# Host Capability Conformance

`abi-v7-explicit-copy.vectors` is the language-neutral shared transcript used by the mock, native,
and browser hosts. Each host parses the same authority and must produce the same detached read,
end-of-buffer, copy, and noncontiguous-write observations. The authority also pins ABI 7.0, all 21
imported call shapes, and all 12 capability kinds.

This first shared suite does not claim that native/browser platform adapters implement all storage,
clock, randomness, durability, or GPU operations. Capability isolation and the broader G04 gate
remain owned by P04-014 onward.
