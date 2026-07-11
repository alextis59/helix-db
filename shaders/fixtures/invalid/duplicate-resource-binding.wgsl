@group(0) @binding(0) var<storage, read> first_input: array<u32>;
@group(0) @binding(0) var<storage, read> second_input: array<u32>;
@group(0) @binding(1) var<storage, read_write> output_values: array<u32>;

@compute @workgroup_size(1)
fn main() {
  output_values[0] = first_input[0] + second_input[0];
}
