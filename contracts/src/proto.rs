/// Protobuf helpers — manual encode/decode without prost.
/// Kept in one place so any changes to the Xion proto schema are easy to find.

use cosmwasm_std::StdError;
use cosmwasm_std::StdResult;

// ── Varint ────────────────────────────────────────────────────────────────────

pub fn encode_varint(mut val: u64, buf: &mut Vec<u8>) {
    loop {
        let byte = (val & 0x7f) as u8;
        val >>= 7;
        if val == 0 {
            buf.push(byte);
            break;
        } else {
            buf.push(byte | 0x80);
        }
    }
}

pub fn decode_varint(data: &[u8]) -> StdResult<(u64, usize)> {
    let mut result: u64 = 0;
    let mut shift = 0u32;
    for (i, &byte) in data.iter().enumerate() {
        result |= ((byte & 0x7f) as u64) << shift;
        if byte & 0x80 == 0 {
            return Ok((result, i + 1));
        }
        shift += 7;
        if shift >= 64 {
            return Err(StdError::generic_err("varint overflow"));
        }
    }
    Err(StdError::generic_err("truncated varint"))
}

// ── Request encoding ──────────────────────────────────────────────────────────

/// Encode a verify request for UltraHonk, Groth16, or Gnark.
///
/// All three Xion query RPCs share the same proto layout:
///   message QueryVerify*Request {
///     bytes  proof         = 1;
///     bytes  public_inputs = 2;
///     string vkey_name     = 3;
///   }
pub fn encode_verify_request(proof: &[u8], public_inputs: &[u8], vkey_name: &str) -> Vec<u8> {
    let mut buf = Vec::new();

    // field 1: bytes proof (tag = 0x0a, wire type 2)
    if !proof.is_empty() {
        buf.push(0x0a);
        encode_varint(proof.len() as u64, &mut buf);
        buf.extend_from_slice(proof);
    }

    // field 2: bytes public_inputs (tag = 0x12, wire type 2)
    if !public_inputs.is_empty() {
        buf.push(0x12);
        encode_varint(public_inputs.len() as u64, &mut buf);
        buf.extend_from_slice(public_inputs);
    }

    // field 3: string vkey_name (tag = 0x1a, wire type 2)
    let name_bytes = vkey_name.as_bytes();
    if !name_bytes.is_empty() {
        buf.push(0x1a);
        encode_varint(name_bytes.len() as u64, &mut buf);
        buf.extend_from_slice(name_bytes);
    }

    buf
}

// ── Response decoding ─────────────────────────────────────────────────────────

/// Decode a ProofVerify* response.
///
/// All three RPCs share the same response layout:
///   message ProofVerifyResponse {
///     bool valid = 1;
///   }
///
/// On-chain confirmed: 0x08 0x01 = verified=true, 0x08 0x00 / empty = false.
#[allow(unused_assignments)]
pub fn decode_verify_response(data: &[u8]) -> StdResult<bool> {
    let mut i = 0;
    while i < data.len() {
        let tag_byte = data[i];
        i += 1;
        let field_number = tag_byte >> 3;
        let wire_type = tag_byte & 0x07;

        match (field_number, wire_type) {
            // field 1, varint: bool valid
            (1, 0) => {
                let (val, consumed) = decode_varint(&data[i..])?;
                i += consumed;
                return Ok(val != 0);
            }
            // skip unknown varint fields
            (_, 0) => {
                let (_, consumed) = decode_varint(&data[i..])?;
                i += consumed;
            }
            // skip unknown length-delimited fields
            (_, 2) => {
                let (len, consumed) = decode_varint(&data[i..])?;
                i += consumed + len as usize;
            }
            _ => {
                return Err(StdError::generic_err(format!(
                    "unexpected protobuf wire type {} for field {}",
                    wire_type, field_number
                )));
            }
        }
    }
    // field absent → false (proto3 default)
    Ok(false)
}

// ── UltraHonk public-input encoding ──────────────────────────────────────────

/// Convert decimal u64 strings → concatenated 32-byte big-endian field elements.
/// This is the encoding the Barretenberg verifier expects for UltraHonk proofs.
/// (24 zero bytes + 8-byte BE u64 per input.)
pub fn encode_ultrahonk_inputs(inputs: &[String]) -> StdResult<Vec<u8>> {
    let mut buf = Vec::with_capacity(inputs.len() * 32);
    for s in inputs {
        let val: u64 = s
            .parse()
            .map_err(|_| StdError::generic_err(format!("invalid public input: {}", s)))?;
        buf.extend_from_slice(&[0u8; 24]);
        buf.extend_from_slice(&val.to_be_bytes());
    }
    Ok(buf)
}
