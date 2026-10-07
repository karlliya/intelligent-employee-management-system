import pathlib
import sys

import pymupdf


def main():
    if len(sys.argv) not in (4, 5):
        raise SystemExit('Usage: insert-demo-qr-pdf.py input.pdf qr.png output.pdf [slide-preview.png]')

    source = pathlib.Path(sys.argv[1])
    qr_image = pathlib.Path(sys.argv[2])
    output = pathlib.Path(sys.argv[3])
    url = (qr_image.parent / 'project-demo-url.txt').read_text(encoding='utf-8').strip()
    document = pymupdf.open(source)
    qr_rectangle = pymupdf.Rect(290, 181, 430, 321)
    placeholder_pages = [page for page in document if 'PROJECT DEMO' in page.get_text() and page.search_for('Insert QR / Demo Link Here')]
    existing_pages = [page for page in document if 'PROJECT DEMO' in page.get_text() and any(
        link['kind'] == pymupdf.LINK_URI and link['from'].intersects(qr_rectangle) for link in page.get_links()
    )]
    if len(placeholder_pages) == 1:
        page = placeholder_pages[0]
        for rectangle in page.search_for('Insert QR / Demo Link Here'):
            page.add_redact_annot(rectangle, fill=(1, 253 / 255, 247 / 255))
        page.apply_redactions(images=0, graphics=0)
        needs_caption = True
    elif len(existing_pages) == 1:
        page = existing_pages[0]
        for link in page.get_links():
            if link['kind'] == pymupdf.LINK_URI and link['from'].intersects(qr_rectangle):
                page.delete_link(link)
        page.add_redact_annot(qr_rectangle, fill=(1, 253 / 255, 247 / 255))
        page.add_redact_annot(pymupdf.Rect(209, 343, 511, 360), fill=(1, 253 / 255, 247 / 255))
        page.apply_redactions(images=2, graphics=0)
        needs_caption = False
    else:
        raise RuntimeError('Expected one Project Demo placeholder or linked QR slide')

    page.insert_image(qr_rectangle, filename=str(qr_image), keep_proportion=True, overlay=True)
    title_result = 0
    if needs_caption:
        title_result = page.insert_textbox(
            pymupdf.Rect(209, 326, 511, 343),
            'SCAN TO OPEN THE LIVE IEMS DEMO',
            fontname='helv', fontsize=9.5, color=(0.12, 0.12, 0.12), align=pymupdf.TEXT_ALIGN_CENTER
        )
    url_result = page.insert_textbox(
        pymupdf.Rect(209, 343, 511, 360),
        url.removeprefix('https://').rstrip('/'),
        fontname='helv', fontsize=8, color=(0.28, 0.28, 0.28), align=pymupdf.TEXT_ALIGN_CENTER
    )
    if title_result < 0 or url_result < 0:
        raise RuntimeError('Demo caption did not fit inside the slide placeholder')
    page.insert_link({'kind': pymupdf.LINK_URI, 'from': qr_rectangle, 'uri': url})
    output.parent.mkdir(parents=True, exist_ok=True)
    document.save(output, garbage=4, deflate=True)
    if len(sys.argv) == 5:
        preview = pathlib.Path(sys.argv[4])
        preview.parent.mkdir(parents=True, exist_ok=True)
        page.get_pixmap(matrix=pymupdf.Matrix(2, 2), alpha=False).save(preview)
    print(f'Saved {output} (slide {page.number + 1} of {len(document)})')


if __name__ == '__main__':
    main()
