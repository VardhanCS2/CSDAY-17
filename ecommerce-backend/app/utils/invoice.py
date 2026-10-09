from collections.abc import Iterable


def create_invoice_pdf(lines: Iterable[str]) -> bytes:
    """Build a dependency-free PDF invoice, adding pages for large orders."""
    text_lines = list(lines)
    page_lines = [text_lines[index:index + 45] for index in range(0, len(text_lines), 45)] or [[]]
    objects = [b"<< /Type /Catalog /Pages 2 0 R >>", b"", b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    page_refs = []
    for page_number, lines_for_page in enumerate(page_lines):
        page_ref = 4 + page_number * 2
        content_ref = page_ref + 1
        page_refs.append(f"{page_ref} 0 R")
        commands = ["BT", "/F1 12 Tf", "50 790 Td", "16 TL"]
        for index, line in enumerate(lines_for_page):
            safe_line = line.encode("ascii", "replace").decode("ascii")
            escaped = safe_line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            if index:
                commands.append("T*")
            commands.append(f"({escaped[:150]}) Tj")
        commands.append("ET")
        content = "\n".join(commands).encode("ascii")
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] "
            f"/Resources << /Font << /F1 3 0 R >> >> /Contents {content_ref} 0 R >>".encode("ascii")
        )
        objects.append(
            b"<< /Length " + str(len(content)).encode("ascii") + b" >>\nstream\n" + content + b"\nendstream"
        )
    objects[1] = (
        f"<< /Type /Pages /Kids [{' '.join(page_refs)}] /Count {len(page_refs)} >>".encode("ascii")
    )
    output = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for number, obj in enumerate(objects, start=1):
        offsets.append(len(output))
        output.extend(f"{number} 0 obj\n".encode("ascii") + obj + b"\nendobj\n")
    xref_offset = len(output)
    output.extend(f"xref\n0 {len(offsets)}\n".encode("ascii"))
    output.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    output.extend(
        f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode("ascii")
    )
    return bytes(output)
