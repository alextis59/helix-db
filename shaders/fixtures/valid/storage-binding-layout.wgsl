// Repository-owned compilation fixture; never dispatched as a product kernel.
struct Control {
  count: u32,
}

@group(0) @binding(0) var<storage, read> input_values: array<u32>;
@group(0) @binding(1) var<storage, read_write> output_values: array<u32>;
@group(0) @binding(2) var<uniform> control: Control;

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) invocation: vec3<u32>) {
  if (invocation.x < control.count) {
    output_values[invocation.x] = input_values[invocation.x];
  }
}
