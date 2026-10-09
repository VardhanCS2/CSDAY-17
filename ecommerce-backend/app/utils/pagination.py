from sqlalchemy.orm import Query



def paginate(
    query: Query,
    page: int = 1,
    limit: int = 10
):
    page = max(page, 1)
    limit = max(limit, 1)
    total = query.count()
    items = query.offset((page - 1) * limit).limit(limit).all()
    return {
        "page": page,
        "limit": limit,
        "total": total,
        "items": items
    }