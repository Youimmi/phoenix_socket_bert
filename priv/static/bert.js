const utf8 = {
  decode: (buffer) => new TextDecoder().decode(buffer)
}

export const decode = (buffer) => {
  const data = new Uint8Array(buffer)
  let index = 0

  const read = {
    uint8: () => data[index++],
    uint16: () => (data[index++] << 8) | data[index++],
    uint32: () => (data[index++] << 24) | (data[index++] << 16) | (data[index++] << 8) | data[index++],
    slice: (length) => data.slice(index, index += length),
  }

  if (read.uint8() !== 131) throw new Error('Invalid BERT format')

  const decodeBignum = (size) => {
    const sign = read.uint8()
    let result = 0
    for (let i = 0; i < size; i++) result = (result << 8) | data[index++]
    return sign === 0 ? result : -result
  }

  const decodeTuple = (size) => {
    const result = new Array(size)
    for (let i = 0; i < size; i++) result[i] = decodeType()
    return result
  }

  const decodeList = (size) => {
    const result = new Array(size)
    for (let i = 0; i < size; i++) result[i] = decodeType()
    decodeType()
    return result
  }

  const decodeMap = (size) => {
    const result = {}
    for (let i = 0; i < size; i++) {
      result[decodeType()] = decodeType()
    }
    return result
  }

  const decodeType = () => {
    const type = read.uint8()
    switch (type) {
      case 80: return read.slice(read.uint16())
      case 97: return read.uint8()
      case 98: return new DataView(buffer, index, 4).getInt32(0, (index += 4, true))
      case 100: return utf8.decode(read.slice(read.uint16()))
      case 104: return decodeTuple(read.uint8())
      case 105: return decodeTuple(read.uint32())
      case 106: return []
      case 108: return decodeList(read.uint32())
      case 109: return utf8.decode(read.slice(read.uint32()))
      case 110: return decodeBignum(read.uint8())
      case 111: return decodeBignum(read.uint32())
      case 115: return utf8.decode(read.slice(read.uint8()))
      case 116: return decodeMap(read.uint32())
      case 119: return utf8.decode(read.slice(read.uint8()))
      default: throw new Error(`Unsupported type: ${type}`)
    }
  }

  return decodeType()
}
