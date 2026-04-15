import mstarpy

def test():
    try:
        # Horos Value Intl ISIN
        f = mstarpy.Funds("ES0146309002", "es")
        print("Name:", f.name)
        
        # Test basic info extraction
        nav = f.nav()
        print("Last NAV Data:", nav)
        
        # Star rating is usually in f.starRating or similar, let's look at the dir
        print("Methods:", [m for m in dir(f) if not m.startswith('_')])
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    test()
